import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { CatalogFile } from "./catalogStore.js";
import { isDriveMounted, loadCatalog } from "./catalogStore.js";

const execFileAsync = promisify(execFile);

function samePath(a: string, b: string): boolean {
  return path.resolve(a) === path.resolve(b);
}

export function isPathInCatalog(catalog: CatalogFile, targetPath: string): boolean {
  const resolved = path.resolve(targetPath);
  return catalog.entries.some((e) => {
    const folder = path.resolve(e.folderPath);
    return (
      samePath(folder, resolved) ||
      resolved.startsWith(`${folder}${path.sep}`) ||
      folder.startsWith(`${resolved}${path.sep}`)
    );
  });
}

function findCatalogEntryForPath(
  catalog: CatalogFile,
  targetPath: string,
): { folderPath: string; drivePath: string } | null {
  const resolved = path.resolve(targetPath);
  let best: { folderPath: string; drivePath: string } | null = null;
  let bestLen = -1;

  for (const e of catalog.entries) {
    const folder = path.resolve(e.folderPath);
    const matches =
      samePath(folder, resolved) ||
      resolved.startsWith(`${folder}${path.sep}`) ||
      folder.startsWith(`${resolved}${path.sep}`);
    if (!matches) continue;
    if (folder.length > bestLen) {
      bestLen = folder.length;
      best = { folderPath: e.folderPath, drivePath: e.drivePath };
    }
  }
  return best;
}

export async function openPathInFinder(targetPath: string): Promise<void> {
  const catalog = await loadCatalog();
  const resolved = path.resolve(targetPath);

  if (!isPathInCatalog(catalog, resolved)) {
    throw new Error("Path is not in the saved index");
  }

  const entry = findCatalogEntryForPath(catalog, resolved);
  if (!entry) {
    throw new Error("Path is not in the saved index");
  }

  if (!(await isDriveMounted(entry.drivePath))) {
    throw new Error("Drive is not connected");
  }

  let stat;
  try {
    stat = await fs.stat(resolved);
  } catch {
    throw new Error("Path not available — connect the drive");
  }

  const toOpen = stat.isDirectory() ? resolved : path.dirname(resolved);

  if (process.platform !== "darwin") {
    throw new Error("Open in Finder is supported on macOS only");
  }

  await execFileAsync("open", [toOpen]);
}
