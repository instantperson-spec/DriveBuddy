import fs from "node:fs/promises";
import { fullHashFile } from "./fileFingerprint.js";
import {
  buildDuplicateGroups,
  loadDuplicateStore,
  saveDuplicateStore,
  type GroupVerification,
} from "./duplicateStore.js";

export async function verifyDuplicateGroup(
  groupKey: string,
): Promise<GroupVerification> {
  const store = await loadDuplicateStore();
  const group = buildDuplicateGroups(store).find((g) => g.key === groupKey);
  if (!group) {
    throw new Error("Duplicate group not found");
  }

  const fileHashes: GroupVerification["fileHashes"] = [];

  for (const file of group.files) {
    try {
      await fs.access(file.path);
      const fullHash = await fullHashFile(file.path);
      fileHashes.push({ path: file.path, fullHash });
    } catch {
      fileHashes.push({
        path: file.path,
        fullHash: null,
        error: "File unavailable — connect drive",
      });
    }
  }

  const withHash = fileHashes.filter((f) => f.fullHash);
  const unique = new Set(withHash.map((f) => f.fullHash));
  const allMatch = withHash.length >= 2 && unique.size === 1;

  const verification: GroupVerification = {
    verifiedAt: new Date().toISOString(),
    allMatch,
    fullHash: allMatch ? withHash[0]?.fullHash ?? null : null,
    fileHashes,
  };

  if (!store.meta.verifications) {
    store.meta.verifications = {};
  }
  store.meta.verifications[groupKey] = verification;
  await saveDuplicateStore(store);

  return verification;
}
