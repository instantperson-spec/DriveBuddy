import type { ArchiveDriveView } from "../types";
import { formatBytes, formatDate, formatPercent } from "../utils/format";

type Props = {
  drives: ArchiveDriveView[];
  selectedDrive: string | null;
  onBrowseDrive: (drivePath: string) => void;
  onShowAllDrives: () => void;
  scanTargets: Set<string>;
  onToggleScanTarget: (drivePath: string) => void;
};

export function DriveSummary({
  drives,
  selectedDrive,
  onBrowseDrive,
  onShowAllDrives,
  scanTargets,
  onToggleScanTarget,
}: Props) {
  return (
    <aside className="volume-panel">
      <div className="panel-head">
        <h2>Drives</h2>
      </div>
      <p className="panel-hint">
        Click a drive to browse. Checkbox = include in scan when connected.
      </p>
      {drives.length === 0 ? (
        <div className="catalog-empty compact">
          <p>No saved index yet. Connect drives and run Scan drives.</p>
        </div>
      ) : (
        <ul className="volume-list">
          {drives.map((drive) => {
            const inScan = scanTargets.has(drive.drivePath);
            const active = selectedDrive === drive.drivePath;
            const hasDiskStats = drive.diskSize > 0;
            const usedPct = hasDiskStats
              ? (drive.diskUsed / drive.diskSize) * 100
              : 0;

            return (
              <li key={drive.drivePath}>
                <div
                  className={`volume-card volume-card-clickable ${active ? "active" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onBrowseDrive(drive.drivePath)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onBrowseDrive(drive.drivePath);
                    }
                  }}
                >
                  <div className="volume-card-top">
                    <label
                      className="scan-check"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={inScan}
                        disabled={!drive.mounted}
                        onChange={() => onToggleScanTarget(drive.drivePath)}
                      />
                      <span className="volume-name">{drive.driveName}</span>
                    </label>
                    <span
                      className={`kind-tag ${drive.mounted ? "kind-mounted" : "kind-offline"}`}
                      title={
                        drive.lastScannedAt
                          ? `Last indexed: ${formatDate(drive.lastScannedAt)}`
                          : undefined
                      }
                    >
                      {drive.mounted
                        ? "Connected"
                        : drive.lastScannedAt
                          ? `Archived · ${formatDate(drive.lastScannedAt)}`
                          : "Archived"}
                    </span>
                  </div>
                  <div className="volume-path" title={drive.drivePath}>
                    {drive.drivePath}
                  </div>

                  {hasDiskStats ? (
                    <>
                      <div className="meter">
                        <div
                          className="meter-fill"
                          style={{ width: `${Math.min(usedPct, 100)}%` }}
                        />
                      </div>
                      <div className="disk-stats-grid">
                        <span>
                          <strong>Capacity</strong> {formatBytes(drive.diskSize)}
                        </span>
                        <span>
                          <strong>Used</strong> {formatBytes(drive.diskUsed)}{" "}
                          ({formatPercent(drive.diskUsed, drive.diskSize)})
                        </span>
                        <span>
                          <strong>Free</strong> {formatBytes(drive.diskFree)}
                        </span>
                      </div>
                      {!drive.mounted && (
                        <div className="catalog-stats muted">
                          Space from last scan (drive unplugged)
                        </div>
                      )}
                      {drive.mounted && !drive.diskStatsLive && (
                        <div className="catalog-stats muted">
                          Rescan to refresh capacity stats
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="catalog-stats muted">
                      No capacity data — rescan while drive is connected
                    </div>
                  )}

                  <div className="catalog-stats muted">
                    {drive.folderCount.toLocaleString()} folders in index
                  </div>

                  {active && (
                    <button
                      type="button"
                      className="link-btn filter-drive-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onShowAllDrives();
                      }}
                    >
                      Show all drives
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
