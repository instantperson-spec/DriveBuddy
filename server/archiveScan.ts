import fs from "node:fs/promises";
import path from "node:path";
import type { CatalogEntry, CatalogFile } from "./catalogStore.js";
import {
  entryId,
  loadCatalog,
  mergeScanResults,
  saveCatalog,
} from "./catalogStore.js";
import { isVideoFile } from "./videoExtensions.js";
import type { VolumeInfo } from "./volumes.js";

export type ScanProgress = {
  running: boolean;
  currentDrive: string | null;
  foldersVisited: number;
  entriesFound: number;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  drivesTotal: number;
  drivesDone: number;
};

type FolderStats = {
  videoCount: number;
  totalBytes: number;
  latestModified: number;
  sampleFiles: string[];
};

const progress: ScanProgress = {
  running: false,
  currentDrive: null,
  foldersVisited: 0,
  entriesFound: 0,
  startedAt: null,
  finishedAt: null,
  error: null,
  drivesTotal: 0,
  drivesDone: 0,
};

export function getScanProgress(): ScanProgress {
  return { ...progress };
}

const SKIP_DIR_NAMES = new Set([
  ".Trashes",
  ".DocumentRevisions-V100",
  ".TemporaryItems",
  "node_modules",
  ".git",
]);

async function statSafe(p: string) {
  try {
    return await fs.stat(p);
  } catch {
    return null;
  }
}

async function walkDrive(
  drive: VolumeInfo,
  entries: CatalogEntry[],
  onFolder: () => void,
): Promise<void> {
  const drivePath = drive.path;

  async function walk(dirPath: string): Promise<FolderStats> {
    onFolder();
    const stats: FolderStats = {
      videoCount: 0,
      totalBytes: 0,
      latestModified: 0,
      sampleFiles: [],
    };

    let dirents;
    try {
      dirents = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return stats;
    }

    for (const dirent of dirents) {
      if (dirent.name.startsWith(".")) continue;
      if (SKIP_DIR_NAMES.has(dirent.name)) continue;

      const fullPath = path.join(dirPath, dirent.name);

      if (dirent.isFile()) {
        if (!isVideoFile(dirent.name)) continue;
        const st = await statSafe(fullPath);
        if (!st) continue;
        stats.videoCount += 1;
        stats.totalBytes += st.size;
        stats.latestModified = Math.max(stats.latestModified, st.mtimeMs);
        if (stats.sampleFiles.length < 6) stats.sampleFiles.push(dirent.name);
        continue;
      }

      let isDir = dirent.isDirectory();
      if (!isDir && dirent.isSymbolicLink()) {
        const st = await statSafe(fullPath);
        isDir = st?.isDirectory() ?? false;
      }
      if (!isDir) continue;

      const child = await walk(fullPath);
      stats.videoCount += child.videoCount;
      stats.totalBytes += child.totalBytes;
      stats.latestModified = Math.max(stats.latestModified, child.latestModified);
      for (const sample of child.sampleFiles) {
        if (stats.sampleFiles.length >= 6) break;
        if (!stats.sampleFiles.includes(sample)) stats.sampleFiles.push(sample);
      }
    }

    const relativePath =
      dirPath === drivePath
        ? "/"
        : path.relative(drivePath, dirPath) || path.basename(dirPath);

    entries.push({
      id: entryId(dirPath),
      title: path.basename(dirPath) || drive.name,
      driveName: drive.name,
      drivePath: drive.path,
      folderPath: dirPath,
      relativePath,
      videoCount: stats.videoCount,
      totalBytes: stats.totalBytes,
      latestModified:
        stats.latestModified > 0
          ? new Date(stats.latestModified).toISOString()
          : null,
      sampleFiles: stats.sampleFiles,
    });
    progress.entriesFound = entries.length;

    return stats;
  }

  await walk(drivePath);
}

export async function runArchiveScan(drives: VolumeInfo[]): Promise<CatalogFile> {
  if (progress.running) {
    throw new Error("Scan already in progress");
  }

  const started = Date.now();
  Object.assign(progress, {
    running: true,
    currentDrive: null,
    foldersVisited: 0,
    entriesFound: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    drivesTotal: drives.length,
    drivesDone: 0,
  });

  const entries: CatalogEntry[] = [];

  try {
    for (const drive of drives) {
      progress.currentDrive = drive.name;
      await walkDrive(drive, entries, () => {
        progress.foldersVisited += 1;
      });
      progress.drivesDone += 1;
    }

    const catalog = await loadCatalog();
    const finishedAt = new Date().toISOString();
    mergeScanResults(
      catalog,
      drives.map((d) => d.path),
      entries,
      drives.map((d) => ({
        path: d.path,
        name: d.name,
        diskSize: d.size,
        diskUsed: d.used,
        diskFree: d.free,
      })),
      finishedAt,
    );
    catalog.meta.lastScanAt = finishedAt;
    catalog.meta.lastScanDurationMs = Date.now() - started;
    await saveCatalog(catalog);
    return catalog;
  } catch (err) {
    progress.error = err instanceof Error ? err.message : "Scan failed";
    throw err;
  } finally {
    progress.running = false;
    progress.currentDrive = null;
    progress.finishedAt = new Date().toISOString();
  }
}

/** Domyślnie skanuj wolumeny zewnętrzne + dysk roboczy ENV itd., bez całego systemowego /. */
export function pickArchiveDrives(volumes: VolumeInfo[]): VolumeInfo[] {
  const external = volumes.filter((v) => v.kind === "external");
  if (external.length > 0) return external;
  return volumes.filter((v) => v.kind !== "system");
}
