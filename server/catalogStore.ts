import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { getDiskSpace } from "./diskSpace.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(__dirname, "..", "data");
const CATALOG_FILE = path.join(DATA_DIR, "catalog.json");

export type CatalogEntry = {
  id: string;
  title: string;
  driveName: string;
  drivePath: string;
  folderPath: string;
  relativePath: string;
  videoCount: number;
  totalBytes: number;
  latestModified: string | null;
  sampleFiles: string[];
};

export type ArchivedDriveRecord = {
  drivePath: string;
  driveName: string;
  lastScannedAt: string;
  diskSize?: number;
  diskUsed?: number;
  diskFree?: number;
};

export type CatalogMeta = {
  version: 2;
  lastScanAt: string | null;
  lastScanDurationMs: number | null;
  entryCount: number;
  /** Ścieżki dysków obecnych w indeksie (offline też) */
  drivesScanned: string[];
  archivedDrives: ArchivedDriveRecord[];
};

export type CatalogFile = {
  meta: CatalogMeta;
  entries: CatalogEntry[];
};

const emptyCatalog = (): CatalogFile => ({
  meta: {
    version: 2,
    lastScanAt: null,
    lastScanDurationMs: null,
    entryCount: 0,
    drivesScanned: [],
    archivedDrives: [],
  },
  entries: [],
});

function migrateCatalog(catalog: CatalogFile): CatalogFile {
  const meta = catalog.meta as CatalogMeta & { version?: number };
  if (!meta.archivedDrives?.length) {
    const seen = new Map<string, ArchivedDriveRecord>();
    for (const e of catalog.entries) {
      if (!seen.has(e.drivePath)) {
        seen.set(e.drivePath, {
          drivePath: e.drivePath,
          driveName: e.driveName,
          lastScannedAt: meta.lastScanAt ?? new Date(0).toISOString(),
        });
      }
    }
    meta.archivedDrives = [...seen.values()];
  }
  if (!meta.drivesScanned?.length && meta.archivedDrives.length) {
    meta.drivesScanned = meta.archivedDrives.map((d) => d.drivePath);
  }
  meta.version = 2;
  catalog.meta = meta;
  return catalog;
}

let memory: CatalogFile | null = null;

export async function loadCatalog(): Promise<CatalogFile> {
  if (memory) return memory;
  try {
    const raw = await fs.readFile(CATALOG_FILE, "utf8");
    memory = migrateCatalog(JSON.parse(raw) as CatalogFile);
    return memory;
  } catch {
    memory = emptyCatalog();
    return memory;
  }
}

export async function saveCatalog(catalog: CatalogFile): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  catalog.meta.entryCount = catalog.entries.length;
  const tmp = `${CATALOG_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(catalog, null, 2), "utf8");
  await fs.rename(tmp, CATALOG_FILE);
  memory = catalog;
}

export function entryId(folderPath: string): string {
  return crypto.createHash("sha256").update(folderPath).digest("hex").slice(0, 16);
}

export type SearchContentFilter = "all" | "withVideo" | "noVideo";

export type SearchParams = {
  q?: string;
  drivePath?: string;
  content?: SearchContentFilter;
  limit?: number;
  offset?: number;
};

export function searchCatalog(
  catalog: CatalogFile,
  params: SearchParams,
): { total: number; entries: CatalogEntry[] } {
  const q = params.q?.trim().toLowerCase() ?? "";
  const drivePath = params.drivePath?.trim() ?? "";
  const content = params.content ?? "all";
  const limit = Math.min(Math.max(params.limit ?? 100, 1), 1000);
  const offset = Math.max(params.offset ?? 0, 0);

  let filtered = catalog.entries;

  if (drivePath) {
    filtered = filtered.filter((e) => samePath(e.drivePath, drivePath));
  }

  if (content === "withVideo") {
    filtered = filtered.filter((e) => e.videoCount > 0);
  } else if (content === "noVideo") {
    filtered = filtered.filter((e) => e.videoCount === 0);
  }

  if (q) {
    const terms = q.split(/\s+/).filter(Boolean);
    filtered = filtered.filter((e) => {
      const hay = [
        e.title,
        e.relativePath,
        e.folderPath,
        e.driveName,
        ...e.sampleFiles,
      ]
        .join(" ")
        .toLowerCase();
      return terms.every((term) => hay.includes(term));
    });
  }

  filtered = filtered.filter(
    (e) => !samePath(e.folderPath, e.drivePath),
  );

  filtered = [...filtered].sort((a, b) => {
    const ta = a.latestModified ?? "";
    const tb = b.latestModified ?? "";
    return tb.localeCompare(ta);
  });

  const total = filtered.length;
  return { total, entries: filtered.slice(offset, offset + limit) };
}

export type CatalogBrowseEntry = CatalogEntry & {
  hasChildren: boolean;
};

export type CatalogBreadcrumb = {
  name: string;
  path: string;
};

function samePath(a: string, b: string): boolean {
  return path.resolve(a) === path.resolve(b);
}

function isDirectChild(parentDir: string, folderPath: string): boolean {
  return samePath(path.dirname(folderPath), parentDir);
}

export function listCatalogChildren(
  catalog: CatalogFile,
  drivePath: string,
  atPath: string,
): {
  atPath: string;
  drivePath: string;
  breadcrumbs: CatalogBreadcrumb[];
  entries: CatalogBrowseEntry[];
} {
  const driveRoot = path.resolve(drivePath);
  const at = path.resolve(atPath);

  if (!samePath(at, driveRoot) && !at.startsWith(`${driveRoot}${path.sep}`)) {
    return { atPath: at, drivePath: driveRoot, breadcrumbs: [], entries: [] };
  }

  const onDrive = catalog.entries.filter((e) =>
    samePath(e.drivePath, driveRoot),
  );
  const entryByPath = new Map(
    onDrive.map((e) => [path.resolve(e.folderPath), e]),
  );

  const childPaths = new Set<string>();
  for (const e of onDrive) {
    const fp = path.resolve(e.folderPath);
    if (samePath(fp, at)) continue;
    if (isDirectChild(at, fp)) {
      childPaths.add(fp);
    }
  }

  const entries: CatalogBrowseEntry[] = [];
  for (const childPath of childPaths) {
    const entry = entryByPath.get(childPath);
    if (!entry) continue;
    const hasChildren = onDrive.some((e) => {
      const fp = path.resolve(e.folderPath);
      return !samePath(fp, childPath) && isDirectChild(childPath, fp);
    });
    entries.push({ ...entry, hasChildren });
  }

  entries.sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
  );

  const driveEntry = onDrive.find((e) => samePath(e.folderPath, driveRoot));
  const driveName = driveEntry?.driveName ?? path.basename(driveRoot);

  const breadcrumbs: CatalogBreadcrumb[] = [{ name: driveName, path: driveRoot }];
  if (!samePath(at, driveRoot)) {
    const rel = path.relative(driveRoot, at);
    let acc = driveRoot;
    for (const seg of rel.split(path.sep).filter(Boolean)) {
      acc = path.join(acc, seg);
      breadcrumbs.push({ name: seg, path: acc });
    }
  }

  return { atPath: at, drivePath: driveRoot, breadcrumbs, entries };
}

export function statsByDrive(catalog: CatalogFile): {
  driveName: string;
  drivePath: string;
  projects: number;
  videos: number;
  bytes: number;
}[] {
  const map = new Map<
    string,
    { driveName: string; drivePath: string; projects: number; videos: number; bytes: number }
  >();

  for (const e of catalog.entries) {
    const key = e.drivePath;
    if (!map.has(key)) {
      map.set(key, {
        driveName: e.driveName,
        drivePath: e.drivePath,
        projects: 0,
        videos: 0,
        bytes: 0,
      });
    }
  }

  for (const [drivePath, row] of map) {
    const onDrive = catalog.entries.filter((e) => e.drivePath === drivePath);
    const root = onDrive.find((e) => samePath(e.folderPath, drivePath));
    row.videos = root?.videoCount ?? 0;
    row.bytes = root?.totalBytes ?? 0;
    row.projects = onDrive.filter(
      (e) => e.videoCount > 0 && !samePath(e.folderPath, drivePath),
    ).length;
  }

  return [...map.values()].sort((a, b) => a.driveName.localeCompare(b.driveName));
}

export async function isDriveMounted(drivePath: string): Promise<boolean> {
  try {
    await fs.access(drivePath);
    const st = await fs.stat(drivePath);
    return st.isDirectory();
  } catch {
    return false;
  }
}

export type ArchiveDriveView = {
  driveName: string;
  drivePath: string;
  diskSize: number;
  diskUsed: number;
  diskFree: number;
  diskStatsLive: boolean;
  folderCount: number;
  lastScannedAt: string | null;
  mounted: boolean;
};

export async function buildArchiveDriveViews(
  catalog: CatalogFile,
): Promise<ArchiveDriveView[]> {
  const stats = statsByDrive(catalog);
  const statsMap = new Map(stats.map((s) => [s.drivePath, s]));
  const records = catalog.meta.archivedDrives ?? [];

  const paths = new Set<string>();
  for (const r of records) paths.add(r.drivePath);
  for (const s of stats) paths.add(s.drivePath);

  const views: ArchiveDriveView[] = [];

  for (const drivePath of paths) {
    const record = records.find((r) => r.drivePath === drivePath);
    const st = statsMap.get(drivePath);
    const mounted = await isDriveMounted(drivePath);
    const onDrive = catalog.entries.filter((e) =>
      samePath(e.drivePath, drivePath),
    );
    const folderCount = onDrive.filter(
      (e) => !samePath(e.folderPath, drivePath),
    ).length;

    let diskSize = record?.diskSize ?? 0;
    let diskFree = record?.diskFree ?? 0;
    let diskUsed = record?.diskUsed ?? 0;
    let diskStatsLive = false;

    if (mounted) {
      const live = await getDiskSpace(drivePath);
      if (live.size > 0) {
        diskSize = live.size;
        diskFree = live.free;
        diskUsed = live.used;
        diskStatsLive = true;
      }
    } else if (diskSize > 0 && diskUsed === 0 && diskFree === 0) {
      diskUsed = Math.max(0, diskSize - diskFree);
    }

    views.push({
      drivePath,
      driveName: record?.driveName ?? st?.driveName ?? drivePath,
      diskSize,
      diskUsed,
      diskFree,
      diskStatsLive,
      folderCount,
      lastScannedAt: record?.lastScannedAt ?? null,
      mounted,
    });
  }

  return views.sort((a, b) => a.driveName.localeCompare(b.driveName));
}

export function mergeScanResults(
  catalog: CatalogFile,
  scannedDrivePaths: string[],
  newEntries: CatalogEntry[],
  scannedDrives: {
    path: string;
    name: string;
    diskSize?: number;
    diskUsed?: number;
    diskFree?: number;
  }[],
  scanFinishedAt: string,
): void {
  const scannedSet = new Set(scannedDrivePaths);
  catalog.entries = [
    ...catalog.entries.filter((e) => !scannedSet.has(e.drivePath)),
    ...newEntries,
  ];

  const archived = catalog.meta.archivedDrives ?? [];
  for (const drive of scannedDrives) {
    const existing = archived.find((a) => a.drivePath === drive.path);
    const record: ArchivedDriveRecord = {
      drivePath: drive.path,
      driveName: drive.name,
      lastScannedAt: scanFinishedAt,
      diskSize: drive.diskSize,
      diskUsed: drive.diskUsed,
      diskFree: drive.diskFree,
    };
    if (existing) Object.assign(existing, record);
    else archived.push(record);
  }
  catalog.meta.archivedDrives = archived;
  catalog.meta.drivesScanned = archived.map((a) => a.drivePath);
}
