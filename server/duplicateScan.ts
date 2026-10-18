import fs from "node:fs/promises";
import path from "node:path";
import { fingerprintFile } from "./fileFingerprint.js";
import {
  fileRecordId,
  loadDuplicateStore,
  mergeDuplicateScan,
  saveDuplicateStore,
  type IndexedFile,
} from "./duplicateStore.js";
import { isVideoFile } from "./videoExtensions.js";
import type { VolumeInfo } from "./volumes.js";

export type DuplicateScanOptions = {
  videoOnly: boolean;
};

export type DuplicateScanProgress = {
  running: boolean;
  currentDrive: string | null;
  filesHashed: number;
  duplicatesFound: number;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  drivesTotal: number;
  drivesDone: number;
};

const progress: DuplicateScanProgress = {
  running: false,
  currentDrive: null,
  filesHashed: 0,
  duplicatesFound: 0,
  startedAt: null,
  finishedAt: null,
  error: null,
  drivesTotal: 0,
  drivesDone: 0,
};

export function getDuplicateScanProgress(): DuplicateScanProgress {
  return { ...progress };
}

const SKIP_DIR_NAMES = new Set([
  ".Trashes",
  ".DocumentRevisions-V100",
  ".TemporaryItems",
  "node_modules",
  ".git",
]);

const MIN_FILE_BYTES = 1024;

async function walkDriveForFiles(
  drive: VolumeInfo,
  out: IndexedFile[],
  fingerprintKeys: Map<string, number>,
  videoOnly: boolean,
): Promise<void> {
  async function walk(dirPath: string): Promise<void> {
    let dirents;
    try {
      dirents = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const dirent of dirents) {
      if (dirent.name.startsWith(".")) continue;

      const fullPath = path.join(dirPath, dirent.name);

      if (dirent.isDirectory()) {
        if (SKIP_DIR_NAMES.has(dirent.name)) continue;
        await walk(fullPath);
        continue;
      }

      let st;
      try {
        st = await fs.stat(fullPath);
      } catch {
        continue;
      }
      if (!st.isFile() || st.size < MIN_FILE_BYTES) continue;
      if (videoOnly && !isVideoFile(dirent.name)) continue;

      let fingerprint: string;
      try {
        fingerprint = await fingerprintFile(fullPath, st.size);
      } catch {
        continue;
      }

      progress.filesHashed += 1;
      const key = `${st.size}:${fingerprint}`;
      fingerprintKeys.set(key, (fingerprintKeys.get(key) ?? 0) + 1);

      out.push({
        id: fileRecordId(fullPath),
        path: fullPath,
        fileName: dirent.name,
        driveName: drive.name,
        drivePath: drive.path,
        size: st.size,
        fingerprint,
        modifiedAt: st.mtime.toISOString(),
      });
    }
  }

  await walk(drive.path);
}

export async function runDuplicateScan(
  drives: VolumeInfo[],
  options: DuplicateScanOptions,
): Promise<void> {
  if (progress.running) {
    throw new Error("Duplicate scan already in progress");
  }

  const started = Date.now();
  Object.assign(progress, {
    running: true,
    currentDrive: null,
    filesHashed: 0,
    duplicatesFound: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    drivesTotal: drives.length,
    drivesDone: 0,
  });

  const collected: IndexedFile[] = [];
  const keyCounts = new Map<string, number>();

  try {
    for (const drive of drives) {
      progress.currentDrive = drive.name;
      await walkDriveForFiles(
        drive,
        collected,
        keyCounts,
        options.videoOnly,
      );
      progress.drivesDone += 1;
    }

    let dupGroups = 0;
    for (const count of keyCounts.values()) {
      if (count > 1) dupGroups += 1;
    }
    progress.duplicatesFound = dupGroups;

    const store = await loadDuplicateStore();
    const finishedAt = new Date().toISOString();
    mergeDuplicateScan(
      store,
      drives.map((d) => d.path),
      collected,
      finishedAt,
      Date.now() - started,
      options.videoOnly,
    );
    await saveDuplicateStore(store);
  } catch (err) {
    progress.error = err instanceof Error ? err.message : "Scan failed";
    throw err;
  } finally {
    progress.running = false;
    progress.currentDrive = null;
    progress.finishedAt = new Date().toISOString();
  }
}
