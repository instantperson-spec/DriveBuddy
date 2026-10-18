import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const DUPLICATE_FILE = path.join(DATA_DIR, "duplicates.json");

export type IndexedFile = {
  id: string;
  path: string;
  fileName: string;
  driveName: string;
  drivePath: string;
  size: number;
  fingerprint: string;
  modifiedAt: string | null;
};

export type GroupVerification = {
  verifiedAt: string;
  allMatch: boolean;
  fullHash: string | null;
  fileHashes: {
    path: string;
    fullHash: string | null;
    error?: string;
  }[];
};

export type DuplicateStoreMeta = {
  lastScanAt: string | null;
  lastScanDurationMs: number | null;
  filesIndexed: number;
  drivesScanned: string[];
  lastScanVideoOnly: boolean;
  verifications: Record<string, GroupVerification>;
};

export type DuplicateStoreFile = {
  meta: DuplicateStoreMeta;
  files: IndexedFile[];
};

export type DuplicateGroup = {
  key: string;
  size: number;
  fingerprint: string;
  copies: number;
  wastedBytes: number;
  files: IndexedFile[];
  verification?: GroupVerification | null;
};

const emptyStore = (): DuplicateStoreFile => ({
  meta: {
    lastScanAt: null,
    lastScanDurationMs: null,
    filesIndexed: 0,
    drivesScanned: [],
    lastScanVideoOnly: false,
    verifications: {},
  },
  files: [],
});

function migrateDuplicateStore(store: DuplicateStoreFile): DuplicateStoreFile {
  if (!store.meta.verifications) store.meta.verifications = {};
  if (store.meta.lastScanVideoOnly === undefined) {
    store.meta.lastScanVideoOnly = false;
  }
  return store;
}

let memory: DuplicateStoreFile | null = null;

export function fileRecordId(filePath: string): string {
  return crypto.createHash("sha256").update(filePath).digest("hex").slice(0, 20);
}

export async function loadDuplicateStore(): Promise<DuplicateStoreFile> {
  if (memory) return memory;
  try {
    const raw = await fs.readFile(DUPLICATE_FILE, "utf8");
    memory = migrateDuplicateStore(JSON.parse(raw) as DuplicateStoreFile);
    return memory;
  } catch {
    memory = emptyStore();
    return memory;
  }
}

export async function saveDuplicateStore(store: DuplicateStoreFile): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  store.meta.filesIndexed = store.files.length;
  const tmp = `${DUPLICATE_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), "utf8");
  await fs.rename(tmp, DUPLICATE_FILE);
  memory = store;
}

export function mergeDuplicateScan(
  store: DuplicateStoreFile,
  scannedDrivePaths: string[],
  newFiles: IndexedFile[],
  finishedAt: string,
  durationMs: number,
  videoOnly: boolean,
): void {
  const scanned = new Set(scannedDrivePaths);
  store.files = [
    ...store.files.filter((f) => !scanned.has(f.drivePath)),
    ...newFiles,
  ];
  const driveSet = new Set(store.files.map((f) => f.drivePath));
  store.meta.drivesScanned = [...driveSet];
  store.meta.lastScanAt = finishedAt;
  store.meta.lastScanDurationMs = durationMs;
  store.meta.lastScanVideoOnly = videoOnly;
}

export function attachVerifications(
  groups: DuplicateGroup[],
  store: DuplicateStoreFile,
): DuplicateGroup[] {
  const verifications = store.meta.verifications ?? {};
  return groups.map((g) => ({
    ...g,
    verification: verifications[g.key] ?? null,
  }));
}

export function buildDuplicateGroups(store: DuplicateStoreFile): DuplicateGroup[] {
  const map = new Map<string, IndexedFile[]>();

  for (const file of store.files) {
    const key = `${file.size}:${file.fingerprint}`;
    const list = map.get(key) ?? [];
    list.push(file);
    map.set(key, list);
  }

  const groups: DuplicateGroup[] = [];

  for (const [key, files] of map) {
    if (files.length < 2) continue;
    const size = files[0]?.size ?? 0;
    groups.push({
      key,
      size,
      fingerprint: files[0]?.fingerprint ?? "",
      copies: files.length,
      wastedBytes: size * (files.length - 1),
      files: [...files].sort((a, b) =>
        a.driveName.localeCompare(b.driveName) || a.path.localeCompare(b.path),
      ),
    });
  }

  groups.sort((a, b) => b.wastedBytes - a.wastedBytes);
  return groups;
}

export function searchDuplicateGroups(
  groups: DuplicateGroup[],
  q: string,
  crossDriveOnly: boolean,
  limit: number,
  offset: number,
): { total: number; groups: DuplicateGroup[]; totalWastedBytes: number } {
  let filtered = groups;

  if (crossDriveOnly) {
    filtered = filtered.filter((g) => {
      const drives = new Set(g.files.map((f) => f.drivePath));
      return drives.size > 1;
    });
  }

  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length) {
    filtered = filtered.filter((g) => {
      const hay = g.files
        .map((f) => `${f.fileName} ${f.path} ${f.driveName}`)
        .join(" ")
        .toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }

  const totalWastedBytes = filtered.reduce((s, g) => s + g.wastedBytes, 0);
  const total = filtered.length;
  return {
    total,
    groups: filtered.slice(offset, offset + limit),
    totalWastedBytes,
  };
}
