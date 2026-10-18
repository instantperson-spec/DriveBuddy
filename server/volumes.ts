import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getDiskSpace } from "./diskSpace.js";

export type VolumeInfo = {
  id: string;
  name: string;
  path: string;
  kind: "system" | "home" | "external" | "other";
  size: number;
  free: number;
  used: number;
};

export async function listVolumes(): Promise<VolumeInfo[]> {
  const volumes: VolumeInfo[] = [];
  const home = os.homedir();

  const rootStats = await getDiskSpace("/");
  volumes.push({
    id: "root",
    name: "Macintosh HD",
    path: "/",
    kind: "system",
    size: rootStats.size,
    free: rootStats.free,
    used: rootStats.size - rootStats.free,
  });

  const homeStats = await getDiskSpace(home);
  volumes.push({
    id: "home",
    name: "Home folder",
    path: home,
    kind: "home",
    size: homeStats.size,
    free: homeStats.free,
    used: homeStats.size - homeStats.free,
  });

  try {
    const entries = await fs.readdir("/Volumes", { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const mountPath = path.join("/Volumes", entry.name);
      if (mountPath === "/" || mountPath === home) continue;
      const stats = await getDiskSpace(mountPath);
      if (stats.size === 0 && stats.free === 0) continue;
      volumes.push({
        id: `vol-${entry.name}`,
        name: entry.name,
        path: mountPath,
        kind: "external",
        size: stats.size,
        free: stats.free,
        used: stats.size - stats.free,
      });
    }
  } catch {
    /* /Volumes may be restricted in sandbox */
  }

  return volumes;
}
