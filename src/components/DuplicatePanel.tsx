import { useState } from "react";
import type { DuplicateGroup, DuplicateMeta, GroupVerification } from "../types";
import { formatBytes, formatDate } from "../utils/format";

type Props = {
  meta: DuplicateMeta | null;
  groups: DuplicateGroup[];
  total: number;
  totalWastedBytes: number;
  loading: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  crossDriveOnly: boolean;
  onCrossDriveChange: (v: boolean) => void;
  videoOnly: boolean;
  onVideoOnlyChange: (v: boolean) => void;
  onStartScan: () => void;
  scanRunning: boolean;
  scanHint: string | null;
  onVerifyGroup: (groupKey: string) => Promise<GroupVerification | null>;
};

function VerificationBadge({
  verification,
}: {
  verification: GroupVerification | null | undefined;
}) {
  if (!verification) return null;
  if (verification.allMatch) {
    return (
      <span className="verify-tag ok" title={verification.fullHash ?? undefined}>
        Full hash: identical
      </span>
    );
  }
  const missing = verification.fileHashes.some((f) => !f.fullHash);
  if (missing) {
    return (
      <span className="verify-tag warn">
        Incomplete verification (connect drives)
      </span>
    );
  }
  return <span className="verify-tag bad">Full hash: different files</span>;
}

export function DuplicatePanel({
  meta,
  groups,
  total,
  totalWastedBytes,
  loading,
  query,
  onQueryChange,
  crossDriveOnly,
  onCrossDriveChange,
  videoOnly,
  onVideoOnlyChange,
  onStartScan,
  scanRunning,
  scanHint,
  onVerifyGroup,
}: Props) {
  const [verifyingKey, setVerifyingKey] = useState<string | null>(null);

  const copyPath = async (p: string) => {
    try {
      await navigator.clipboard.writeText(p);
    } catch {
      /* ignore */
    }
  };

  const handleVerify = async (groupKey: string) => {
    setVerifyingKey(groupKey);
    try {
      await onVerifyGroup(groupKey);
    } finally {
      setVerifyingKey(null);
    }
  };

  return (
    <div className="duplicate-panel">
      <div className="duplicate-toolbar">
        <div>
          <h3>Duplicate files</h3>
          <p className="muted">
            Quick scan: size + file sample. Optional full-file hash per group
            (requires connected drives).
          </p>
        </div>
        <button
          type="button"
          className="btn primary"
          onClick={onStartScan}
          disabled={scanRunning}
        >
          {scanRunning ? "Scanning duplicates…" : "Scan duplicates"}
        </button>
      </div>

      {scanHint && <div className="banner info">{scanHint}</div>}

      <div className="meta-bar compact">
        <span>
          Last scan:{" "}
          <strong>
            {meta?.lastScanAt ? formatDate(meta.lastScanAt) : "none"}
          </strong>
        </span>
        <span>
          Scope:{" "}
          <strong>
            {meta?.lastScanVideoOnly === false ? "all files" : "video only"}
          </strong>
        </span>
        <span>Files indexed: {meta?.filesIndexed ?? 0}</span>
        <span>Duplicate groups: {meta?.groupCount ?? 0}</span>
        <span>Cross-drive: {meta?.crossDriveGroupCount ?? 0}</span>
        <span>
          Reclaimable space:{" "}
          {formatBytes(meta?.totalWastedBytes ?? totalWastedBytes)}
        </span>
      </div>

      <div className="search-row">
        <input
          type="search"
          className="search-input"
          placeholder="Filter by file name or path…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        <label className="check-inline">
          <input
            type="checkbox"
            checked={crossDriveOnly}
            onChange={(e) => onCrossDriveChange(e.target.checked)}
          />
          Cross-drive only
        </label>
        <label className="check-inline">
          <input
            type="checkbox"
            checked={videoOnly}
            onChange={(e) => onVideoOnlyChange(e.target.checked)}
          />
          Video files only (faster scan)
        </label>
      </div>

      {loading ? (
        <div className="catalog-empty">
          <p>Loading…</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="catalog-empty">
          <p>
            No saved duplicates. Select drives on the left and run a scan.
          </p>
        </div>
      ) : (
        <div className="dup-list">
          <p className="muted dup-list-head">
            Showing {groups.length} of {total} groups
          </p>
          {groups.map((group) => (
            <article key={group.key} className="dup-card">
              <header className="dup-card-head">
                <div>
                  <strong>{group.files[0]?.fileName ?? "File"}</strong>
                  <span className="muted">
                    {" "}
                    · {formatBytes(group.size)} · {group.copies} copies
                  </span>
                  <div className="dup-badges">
                    <VerificationBadge verification={group.verification} />
                    {group.verification?.verifiedAt && (
                      <span className="muted verify-when">
                        {formatDate(group.verification.verifiedAt)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="dup-card-actions">
                  <button
                    type="button"
                    className="btn secondary tiny"
                    disabled={verifyingKey === group.key || scanRunning}
                    onClick={() => void handleVerify(group.key)}
                  >
                    {verifyingKey === group.key
                      ? "Hashing…"
                      : "Full hash"}
                  </button>
                  <span className="waste-tag">
                    reclaim {formatBytes(group.wastedBytes)}
                  </span>
                </div>
              </header>
              <ul className="dup-paths">
                {group.files.map((f) => {
                  const vh = group.verification?.fileHashes.find(
                    (h) => h.path === f.path,
                  );
                  return (
                    <li key={f.id}>
                      <span className="drive-pill">{f.driveName}</span>
                      <code className="dup-path" title={f.path}>
                        {f.path}
                        {vh?.fullHash && (
                          <span className="hash-preview">
                            {" "}
                            · {vh.fullHash.slice(0, 12)}…
                          </span>
                        )}
                        {vh?.error && (
                          <span className="hash-err"> · {vh.error}</span>
                        )}
                      </code>
                      <button
                        type="button"
                        className="btn tiny"
                        onClick={() => void copyPath(f.path)}
                      >
                        Copy
                      </button>
                    </li>
                  );
                })}
              </ul>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
