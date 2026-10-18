import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type DiskSpace = {
  size: number;
  free: number;
  used: number;
};

export async function getDiskSpace(mountPath: string): Promise<DiskSpace> {
  try {
    const { stdout } = await execFileAsync("df", ["-k", mountPath]);
    const line = stdout.trim().split("\n")[1];
    if (!line) return { size: 0, free: 0, used: 0 };
    const parts = line.split(/\s+/);
    const totalKb = Number.parseInt(parts[1] ?? "0", 10);
    const availKb = Number.parseInt(parts[3] ?? "0", 10);
    const size = totalKb * 1024;
    const free = availKb * 1024;
    return { size, free, used: Math.max(0, size - free) };
  } catch {
    return { size: 0, free: 0, used: 0 };
  }
}
