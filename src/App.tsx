import { useCallback, useEffect, useMemo, useState } from "react";
import { DriveSummary } from "./components/DriveSummary";
import { CatalogBrowser } from "./components/CatalogBrowser";
import { CatalogSearchBar } from "./components/CatalogSearchBar";
import { DuplicatePanel } from "./components/DuplicatePanel";
import type {
  AppTab,
  ArchiveDriveView,
  CatalogBreadcrumb,
  CatalogBrowseEntry,
  CatalogEntry,
  CatalogMeta,
  DuplicateGroup,
  DuplicateMeta,
  DuplicateScanProgress,
  GroupVerification,
  ScanProgress,
  SearchContentFilter,
  VolumeInfo,
} from "./types";
import { formatDate, formatDuration } from "./utils/format";

export default function App() {
  const [tab, setTab] = useState<AppTab>("catalog");
  const [meta, setMeta] = useState<CatalogMeta | null>(null);
  const [archiveDrives, setArchiveDrives] = useState<ArchiveDriveView[]>([]);
  const [mountedPaths, setMountedPaths] = useState<Set<string>>(new Set());
  const [entries, setEntries] = useState<CatalogBrowseEntry[] | CatalogEntry[]>(
    [],
  );
  const [breadcrumbs, setBreadcrumbs] = useState<CatalogBreadcrumb[]>([]);
  const [browseAtPath, setBrowseAtPath] = useState<string | null>(null);
  const [catalogMode, setCatalogMode] = useState<"drives" | "browse" | "search">(
    "drives",
  );
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchDrivePath, setSearchDrivePath] = useState("");
  const [searchContent, setSearchContent] =
    useState<SearchContentFilter>("all");
  const [driveFilter, setDriveFilter] = useState<string | null>(null);
  const [scanTargets, setScanTargets] = useState<Set<string>>(new Set());
  const [catalogProgress, setCatalogProgress] = useState<ScanProgress | null>(
    null,
  );
  const [dupProgress, setDupProgress] = useState<DuplicateScanProgress | null>(
    null,
  );
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [dupMeta, setDupMeta] = useState<DuplicateMeta | null>(null);
  const [dupGroups, setDupGroups] = useState<DuplicateGroup[]>([]);
  const [dupTotal, setDupTotal] = useState(0);
  const [dupWasted, setDupWasted] = useState(0);
  const [dupQuery, setDupQuery] = useState("");
  const [debouncedDupQuery, setDebouncedDupQuery] = useState("");
  const [crossDriveOnly, setCrossDriveOnly] = useState(true);
  const [videoOnly, setVideoOnly] = useState(true);
  const [loadingDup, setLoadingDup] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedDupQuery(dupQuery.trim()), 250);
    return () => clearTimeout(t);
  }, [dupQuery]);

  const loadMeta = useCallback(async () => {
    const res = await fetch("/api/catalog/meta");
    const data = await res.json();
    setMeta(data.meta);
    setArchiveDrives(data.drives ?? []);
  }, []);

  const loadDupMeta = useCallback(async () => {
    const res = await fetch("/api/duplicates/meta");
    const data = await res.json();
    setDupMeta({
      ...data.meta,
      groupCount: data.groupCount ?? 0,
      crossDriveGroupCount: data.crossDriveGroupCount ?? 0,
      totalWastedBytes: data.totalWastedBytes ?? 0,
    });
  }, []);

  const searchFiltersActive =
    debouncedQuery.length > 0 ||
    searchDrivePath.length > 0 ||
    searchContent !== "all";

  const loadCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      if (searchFiltersActive) {
        const params = new URLSearchParams();
        if (debouncedQuery) params.set("q", debouncedQuery);
        if (searchDrivePath) params.set("drivePath", searchDrivePath);
        if (searchContent !== "all") params.set("content", searchContent);
        params.set("limit", "1000");
        const res = await fetch(`/api/catalog?${params}`);
        const data = await res.json();
        setCatalogMode("search");
        setEntries(data.entries ?? []);
        setTotal(data.total ?? 0);
        setBreadcrumbs([]);
        setError(null);
        return;
      }

      if (!driveFilter) {
        setCatalogMode("drives");
        setEntries([]);
        setBreadcrumbs([]);
        setTotal(0);
        setError(null);
        return;
      }

      const at =
        browseAtPath && browseAtPath.startsWith(driveFilter)
          ? browseAtPath
          : driveFilter;
      const params = new URLSearchParams({
        drivePath: driveFilter,
        atPath: at,
      });
      const res = await fetch(`/api/catalog/browse?${params}`);
      const data = await res.json();
      setCatalogMode("browse");
      setEntries(data.entries ?? []);
      setBreadcrumbs(data.breadcrumbs ?? []);
      setTotal(data.entries?.length ?? 0);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load index");
    } finally {
      setLoadingCatalog(false);
    }
  }, [
    debouncedQuery,
    driveFilter,
    browseAtPath,
    searchFiltersActive,
    searchDrivePath,
    searchContent,
  ]);

  const openInFinder = useCallback(async (folderPath: string) => {
    setError(null);
    const res = await fetch("/api/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: folderPath }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not open in Finder");
    }
  }, []);

  const clearSearchFilters = useCallback(() => {
    setQuery("");
    setDebouncedQuery("");
    setSearchDrivePath("");
    setSearchContent("all");
  }, []);

  const loadDuplicates = useCallback(async () => {
    setLoadingDup(true);
    try {
      const params = new URLSearchParams();
      if (debouncedDupQuery) params.set("q", debouncedDupQuery);
      if (crossDriveOnly) params.set("crossDrive", "1");
      params.set("limit", "80");
      const res = await fetch(`/api/duplicates?${params}`);
      const data = await res.json();
      setDupGroups(data.groups ?? []);
      setDupTotal(data.total ?? 0);
      setDupWasted(data.totalWastedBytes ?? 0);
    } catch {
      /* ignore */
    } finally {
      setLoadingDup(false);
    }
  }, [debouncedDupQuery, crossDriveOnly]);

  useEffect(() => {
    void loadMeta();
    void loadDupMeta();
  }, [loadMeta, loadDupMeta]);

  useEffect(() => {
    fetch("/api/volumes")
      .then((r) => r.json())
      .then((data) => {
        const vols: VolumeInfo[] = data.volumes ?? [];
        const mounted = new Set(
          vols.filter((v) => v.kind !== "system").map((v) => v.path),
        );
        setMountedPaths(mounted);
        setScanTargets((prev) => {
          if (prev.size > 0) {
            return new Set([...prev].filter((p) => mounted.has(p)));
          }
          const external = vols
            .filter((v) => v.kind === "external")
            .map((v) => v.path);
          return new Set(
            external.length
              ? external
              : vols.filter((v) => v.kind !== "system").map((v) => v.path),
          );
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const browseDrive = useCallback((drivePath: string) => {
    setQuery("");
    setDebouncedQuery("");
    setDriveFilter(drivePath);
    setBrowseAtPath(drivePath);
    setTab("catalog");
  }, []);

  const showAllDrives = useCallback(() => {
    setQuery("");
    setDebouncedQuery("");
    setDriveFilter(null);
    setBrowseAtPath(null);
  }, []);

  const openDrive = (drivePath: string) => {
    browseDrive(drivePath);
  };

  const navigateCatalog = (folderPath: string) => {
    setBrowseAtPath(folderPath);
  };

  const openCatalogFolder = (entry: CatalogBrowseEntry) => {
    setBrowseAtPath(entry.folderPath);
  };

  useEffect(() => {
    void loadDuplicates();
  }, [loadDuplicates]);

  useEffect(() => {
    if (!catalogProgress?.running) return;
    const id = setInterval(async () => {
      const res = await fetch("/api/catalog/scan/status");
      const st = (await res.json()) as ScanProgress;
      setCatalogProgress(st);
      if (!st.running) {
        await loadMeta();
        await loadCatalog();
      }
    }, 1500);
    return () => clearInterval(id);
  }, [catalogProgress?.running, loadMeta, loadCatalog]);

  useEffect(() => {
    if (!dupProgress?.running) return;
    const id = setInterval(async () => {
      const res = await fetch("/api/duplicates/scan/status");
      const st = (await res.json()) as DuplicateScanProgress;
      setDupProgress(st);
      if (!st.running) {
        await loadDupMeta();
        await loadDuplicates();
      }
    }, 1500);
    return () => clearInterval(id);
  }, [dupProgress?.running, loadDupMeta, loadDuplicates]);

  const startCatalogScan = async () => {
    setError(null);
    const paths = [...scanTargets];
    if (paths.length === 0) {
      setError("Select at least one drive to scan.");
      return;
    }
    const res = await fetch("/api/catalog/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drivePaths: paths }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not start scan");
      return;
    }
    setCatalogProgress({
      running: true,
      currentDrive: null,
      foldersVisited: 0,
      entriesFound: 0,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
      drivesTotal: paths.length,
      drivesDone: 0,
    });
  };

  const startDuplicateScan = async () => {
    setError(null);
    const paths = [...scanTargets];
    if (paths.length === 0) {
      setError("Select at least one drive for duplicate scan.");
      return;
    }
    const res = await fetch("/api/duplicates/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drivePaths: paths, videoOnly }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not start duplicate scan");
      return;
    }
    setDupProgress({
      running: true,
      currentDrive: null,
      filesHashed: 0,
      duplicatesFound: 0,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
      drivesTotal: paths.length,
      drivesDone: 0,
    });
  };

  const verifyDuplicateGroup = async (
    groupKey: string,
  ): Promise<GroupVerification | null> => {
    setError(null);
    const res = await fetch("/api/duplicates/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: groupKey }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Verification failed");
      return null;
    }
    await loadDuplicates();
    return data.verification as GroupVerification;
  };

  const toggleScanTarget = (drivePath: string) => {
    setScanTargets((prev) => {
      const next = new Set(prev);
      if (next.has(drivePath)) next.delete(drivePath);
      else next.add(drivePath);
      return next;
    });
  };

  const catalogScanHint = useMemo(() => {
    if (!catalogProgress?.running) return null;
    return `Scanning drives: ${catalogProgress.currentDrive ?? "…"} · folders: ${catalogProgress.foldersVisited} · entries: ${catalogProgress.entriesFound}`;
  }, [catalogProgress]);

  const dupScanHint = useMemo(() => {
    if (!dupProgress?.running) return null;
    return `Duplicates: ${dupProgress.currentDrive ?? "…"} · files: ${dupProgress.filesHashed} · groups: ${dupProgress.duplicatesFound}`;
  }, [dupProgress]);

  const anyScanRunning =
    catalogProgress?.running || dupProgress?.running || false;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark" aria-hidden />
          <div>
            <h1>Drive Buddy</h1>
            <p>Saved archive — browse with drives unplugged</p>
          </div>
        </div>
        <div className="header-actions">
          <nav className="tab-nav" aria-label="View">
            <button
              type="button"
              className={`tab-btn ${tab === "catalog" ? "active" : ""}`}
              onClick={() => setTab("catalog")}
            >
              Video catalog
            </button>
            <button
              type="button"
              className={`tab-btn ${tab === "duplicates" ? "active" : ""}`}
              onClick={() => setTab("duplicates")}
            >
              Duplicates
            </button>
          </nav>
          {tab === "catalog" ? (
            <button
              type="button"
              className="btn primary"
              onClick={() => void startCatalogScan()}
              disabled={anyScanRunning}
            >
              {catalogProgress?.running ? "Scanning drives…" : "Scan drives"}
            </button>
          ) : (
            <button
              type="button"
              className="btn primary"
              onClick={() => void startDuplicateScan()}
              disabled={anyScanRunning}
            >
              {dupProgress?.running ? "Scanning duplicates…" : "Scan duplicates"}
            </button>
          )}
        </div>
      </header>

      {tab === "catalog" && (
        <div className="meta-bar">
          <span>
          Last scan:{" "}
          <strong>{meta?.lastScanAt ? formatDate(meta.lastScanAt) : "none"}</strong>
        </span>
        <span>Scan time: {formatDuration(meta?.lastScanDurationMs ?? null)}</span>
        <span>In index: {meta?.entryCount ?? 0} video folders</span>
        <span>
          Mode:{" "}
          <strong>
            {mountedPaths.size > 0
              ? `${mountedPaths.size} drive(s) connected`
              : "offline — saved catalog only"}
          </strong>
        </span>
        </div>
      )}

      {catalogScanHint && tab === "catalog" && (
        <div className="banner info">{catalogScanHint}</div>
      )}
      {catalogProgress?.error && tab === "catalog" && (
        <div className="banner error">{catalogProgress.error}</div>
      )}
      {dupProgress?.error && tab === "duplicates" && (
        <div className="banner error">{dupProgress.error}</div>
      )}
      {error && <div className="banner error">{error}</div>}

      <div className="app-body">
        <DriveSummary
          drives={archiveDrives}
          selectedDrive={driveFilter}
          onBrowseDrive={browseDrive}
          onShowAllDrives={showAllDrives}
          scanTargets={scanTargets}
          onToggleScanTarget={toggleScanTarget}
        />

        <main className="main-panel">
          {tab === "catalog" ? (
            <>
              <CatalogSearchBar
                query={query}
                onQueryChange={setQuery}
                drivePath={searchDrivePath}
                onDrivePathChange={setSearchDrivePath}
                content={searchContent}
                onContentChange={setSearchContent}
                drives={archiveDrives}
                onClearFilters={clearSearchFilters}
                filtersActive={searchFiltersActive}
              />
              {driveFilter && !searchFiltersActive && (
                <div className="browse-toolbar">
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={showAllDrives}
                  >
                    All drives
                  </button>
                </div>
              )}
              <CatalogBrowser
                mode={catalogMode}
                drives={archiveDrives}
                breadcrumbs={breadcrumbs}
                entries={entries}
                total={total}
                loading={loadingCatalog}
                onOpenDrive={openDrive}
                onNavigate={navigateCatalog}
                onOpenFolder={openCatalogFolder}
                onOpenInFinder={(p) => void openInFinder(p)}
              />
            </>
          ) : (
            <DuplicatePanel
              meta={dupMeta}
              groups={dupGroups}
              total={dupTotal}
              totalWastedBytes={dupWasted}
              loading={loadingDup}
              query={dupQuery}
              onQueryChange={setDupQuery}
              crossDriveOnly={crossDriveOnly}
              onCrossDriveChange={setCrossDriveOnly}
              videoOnly={videoOnly}
              onVideoOnlyChange={setVideoOnly}
              onStartScan={() => void startDuplicateScan()}
              scanRunning={dupProgress?.running ?? false}
              scanHint={dupScanHint}
              onVerifyGroup={verifyDuplicateGroup}
            />
          )}
        </main>
      </div>
    </div>
  );
}
