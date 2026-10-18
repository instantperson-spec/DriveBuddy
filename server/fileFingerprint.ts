import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";

const SAMPLE_BYTES = 65536;

/** Szybki odcisk: rozmiar + pierwsze i ostatnie 64 KB (wystarcza dla duplikatów w archiwum). */
export async function fingerprintFile(
  filePath: string,
  size: number,
): Promise<string> {
  const hash = crypto.createHash("sha256");
  hash.update(`size:${size}`);

  if (size <= 0) {
    return hash.digest("hex");
  }

  const handle = await fs.open(filePath, "r");
  try {
    const headLen = Math.min(SAMPLE_BYTES, size);
    const head = Buffer.alloc(headLen);
    await handle.read(head, 0, headLen, 0);
    hash.update(head);

    if (size > headLen) {
      const tailLen = Math.min(SAMPLE_BYTES, size - headLen);
      const tail = Buffer.alloc(tailLen);
      await handle.read(tail, 0, tailLen, size - tailLen);
      hash.update(tail);
    }
  } finally {
    await handle.close();
  }

  return hash.digest("hex");
}

/** Pełny SHA-256 pliku — wolny na dużych wideo, ale daje 100% pewności. */
export function fullHashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk: Buffer) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}
