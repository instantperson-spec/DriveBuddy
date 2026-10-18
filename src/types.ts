export type VolumeInfo = {
  id: string;
  name: string;
  path: string;
  kind: "system" | "home" | "external" | "other";
  size: number;
  free: number;
  used: number;
};

export type CatalogEntry = {
  id: string;
  title: string;
  driveName: string;
  drivePath: string;
  folderPath: string;
  relativePath: string;
  videoCount: number;
  totalBytes: number;
  latestModified: string | null;
  sampleFiles: string[];
};

export type CatalogBrowseEntry = CatalogEntry & {
  hasChildren: boolean;
};

export type CatalogBreadcrumb = {
  name: string;
  path: string;
};

export type CatalogMeta = {
  version: number;
  lastScanAt: string | null;
  lastScanDurationMs: number | null;
  entryCount: number;
  drivesScanned: string[];
  archivedDrives?: { drivePath: string; driveName: string; lastScannedAt: string }[];
};

export type ArchiveDriveView = {
  driveName: string;
  drivePath: string;
  diskSize: number;
  diskUsed: number;
  diskFree: number;
  diskStatsLive: boolean;
  folderCount: number;
  lastScannedAt: string | null;
  mounted: boolean;
};

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

export type DuplicateGroup = {
  key: string;
  size: number;
  fingerprint: string;
  copies: number;
  wastedBytes: number;
  files: IndexedFile[];
  verification?: GroupVerification | null;
};

export type DuplicateMeta = {
  lastScanAt: string | null;
  lastScanDurationMs: number | null;
  filesIndexed: number;
  drivesScanned: string[];
  lastScanVideoOnly?: boolean;
  groupCount: number;
  crossDriveGroupCount: number;
  totalWastedBytes: number;
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

export type AppTab = "catalog" | "duplicates";

export type SearchContentFilter = "all" | "withVideo" | "noVideo";
