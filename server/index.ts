import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listVolumes } from "./volumes.js";
import {
  getScanProgress,
  pickArchiveDrives,
  runArchiveScan,
} from "./archiveScan.js";
import {
  getDuplicateScanProgress,
  runDuplicateScan,
} from "./duplicateScan.js";
import {
  attachVerifications,
  buildDuplicateGroups,
  loadDuplicateStore,
  searchDuplicateGroups,
} from "./duplicateStore.js";
import { verifyDuplicateGroup } from "./duplicateVerify.js";
import { openPathInFinder } from "./openPath.js";
import {
  buildArchiveDriveViews,
  isDriveMounted,
  listCatalogChildren,
  loadCatalog,
  searchCatalog,
} from "./catalogStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3847;

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/volumes", async (_req, res) => {
  try {
    const volumes = await listVolumes();
    res.json({ volumes });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Failed to list drives",
    });
  }
});

app.get("/api/catalog/meta", async (_req, res) => {
  const catalog = await loadCatalog();
  const drives = await buildArchiveDriveViews(catalog);
  res.json({
    meta: catalog.meta,
    drives,
  });
});

app.get("/api/catalog/browse", async (req, res) => {
  const catalog = await loadCatalog();
  const drivePath =
    typeof req.query.drivePath === "string" ? req.query.drivePath : "";
  const atPath =
    typeof req.query.atPath === "string" && req.query.atPath
      ? req.query.atPath
      : drivePath;

  if (!drivePath) {
    res.status(400).json({ error: "drivePath is required" });
    return;
  }

  const result = listCatalogChildren(catalog, drivePath, atPath);
  res.json(result);
});

app.get("/api/catalog", async (req, res) => {
  const catalog = await loadCatalog();
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const drivePath =
    typeof req.query.drivePath === "string" ? req.query.drivePath : undefined;
  const contentRaw = req.query.content;
  const content =
    contentRaw === "withVideo" ||
    contentRaw === "noVideo" ||
    contentRaw === "all"
      ? contentRaw
      : undefined;
  const limit =
    typeof req.query.limit === "string"
      ? parseInt(req.query.limit, 10)
      : undefined;
  const offset =
    typeof req.query.offset === "string"
      ? parseInt(req.query.offset, 10)
      : undefined;

  const result = searchCatalog(catalog, {
    q,
    drivePath,
    content,
    limit,
    offset,
  });
  res.json(result);
});

app.get("/api/catalog/scan/status", (_req, res) => {
  res.json(getScanProgress());
});

app.post("/api/open", async (req, res) => {
  const target = typeof req.body?.path === "string" ? req.body.path : "";
  if (!target) {
    res.status(400).json({ error: "Path is required" });
    return;
  }
  try {
    await openPathInFinder(target);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "Could not open path",
    });
  }
});

app.post("/api/catalog/scan", async (req, res) => {
  const progress = getScanProgress();
  if (progress.running) {
    res.status(409).json({ error: "Scan already in progress", progress });
    return;
  }
  if (getDuplicateScanProgress().running) {
    res.status(409).json({ error: "Duplicate scan in progress — wait for it to finish." });
    return;
  }

  const volumes = await listVolumes();
  const body = req.body as { drivePaths?: string[] } | undefined;
  let selected = pickArchiveDrives(volumes);

  if (body?.drivePaths?.length) {
    const set = new Set(body.drivePaths);
    selected = volumes.filter((v) => set.has(v.path));
  }

  if (selected.length === 0) {
    res.status(400).json({
      error:
        "No connected drives to scan. Connect a drive, refresh, and scan again. Saved index still works offline.",
    });
    return;
  }

  for (const drive of selected) {
    if (!(await isDriveMounted(drive.path))) {
      res.status(400).json({
        error: `Drive unavailable: ${drive.name}. Archived index for unplugged drives is kept.`,
      });
      return;
    }
  }

  res.json({
    started: true,
    drives: selected.map((d) => ({ name: d.name, path: d.path })),
  });

  void runArchiveScan(selected).catch((err) => {
    console.error("Archive scan failed:", err);
  });
});

app.get("/api/duplicates/meta", async (_req, res) => {
  const store = await loadDuplicateStore();
  const groups = buildDuplicateGroups(store);
  const crossDrive = groups.filter((g) => {
    const drives = new Set(g.files.map((f) => f.drivePath));
    return drives.size > 1;
  });
  const wasted = groups.reduce((s, g) => s + g.wastedBytes, 0);
  res.json({
    meta: store.meta,
    groupCount: groups.length,
    crossDriveGroupCount: crossDrive.length,
    totalWastedBytes: wasted,
    progress: getDuplicateScanProgress(),
  });
});

app.get("/api/duplicates", async (req, res) => {
  const store = await loadDuplicateStore();
  const groups = buildDuplicateGroups(store);
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const crossDriveOnly = req.query.crossDrive === "1" || req.query.crossDrive === "true";
  const limit =
    typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 80;
  const offset =
    typeof req.query.offset === "string" ? parseInt(req.query.offset, 10) : 0;

  const result = searchDuplicateGroups(
    groups,
    q,
    crossDriveOnly,
    Number.isFinite(limit) ? limit : 80,
    Number.isFinite(offset) ? offset : 0,
  );
  res.json({
    ...result,
    groups: attachVerifications(result.groups, store),
  });
});

app.get("/api/duplicates/scan/status", (_req, res) => {
  res.json(getDuplicateScanProgress());
});

app.post("/api/duplicates/scan", async (req, res) => {
  if (getScanProgress().running) {
    res.status(409).json({ error: "Archive scan in progress — wait for it to finish." });
    return;
  }
  const dupProgress = getDuplicateScanProgress();
  if (dupProgress.running) {
    res.status(409).json({ error: "Duplicate scan already running", progress: dupProgress });
    return;
  }

  const volumes = await listVolumes();
  const body = req.body as { drivePaths?: string[]; videoOnly?: boolean } | undefined;
  let selected = pickArchiveDrives(volumes);

  if (body?.drivePaths?.length) {
    const set = new Set(body.drivePaths);
    selected = volumes.filter((v) => set.has(v.path));
  }

  if (selected.length === 0) {
    res.status(400).json({
      error:
        "No connected drives. You can browse duplicates offline from the last scan.",
    });
    return;
  }

  for (const drive of selected) {
    if (!(await isDriveMounted(drive.path))) {
      res.status(400).json({ error: `Drive unavailable: ${drive.name}` });
      return;
    }
  }

  const videoOnly = body?.videoOnly !== false;

  res.json({
    started: true,
    videoOnly,
    drives: selected.map((d) => ({ name: d.name, path: d.path })),
  });

  void runDuplicateScan(selected, { videoOnly }).catch((err) => {
    console.error("Duplicate scan failed:", err);
  });
});

app.post("/api/duplicates/verify", async (req, res) => {
  const key = typeof req.body?.key === "string" ? req.body.key : "";
  if (!key) {
    res.status(400).json({ error: "Missing group key" });
    return;
  }
  if (getDuplicateScanProgress().running || getScanProgress().running) {
    res.status(409).json({ error: "Wait for the scan to finish" });
    return;
  }
  try {
    const verification = await verifyDuplicateGroup(key);
    res.json({ verification });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "Verification failed",
    });
  }
});

const isProd = process.env.NODE_ENV === "production";
if (isProd) {
  const webRoot = path.join(__dirname, "../dist");
  app.use(express.static(webRoot));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(webRoot, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Drive Buddy API: http://127.0.0.1:${PORT}`);
});
