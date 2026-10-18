import type {
  ArchiveDriveView,
  CatalogBreadcrumb,
  CatalogBrowseEntry,
  CatalogEntry,
} from "../types";
import { formatBytes, formatDate, formatPercent } from "../utils/format";

type Props = {
  mode: "drives" | "browse" | "search";
  drives: ArchiveDriveView[];
  breadcrumbs: CatalogBreadcrumb[];
  entries: CatalogBrowseEntry[] | CatalogEntry[];
  total: number;
  loading: boolean;
  onOpenDrive: (drivePath: string) => void;
  onNavigate: (folderPath: string) => void;
  onOpenFolder: (entry: CatalogBrowseEntry) => void;
  onOpenInFinder: (folderPath: string) => void;
};

export function CatalogBrowser({
  mode,
  drives,
  breadcrumbs,
  entries,
  total,
  loading,
  onOpenDrive,
  onNavigate,
  onOpenFolder,
  onOpenInFinder,
}: Props) {
  const isDriveConnected = (drivePath: string) =>
    drives.find((d) => d.drivePath === drivePath)?.mounted ?? false;
  const copyPath = async (p: string) => {
    try {
      await navigator.clipboard.writeText(p);
    } catch {
      /* ignore */
    }
  };

  if (loading) {
    return (
      <div className="catalog-empty">
        <p>Loading…</p>
      </div>
    );
  }

  if (mode === "drives") {
    return (
      <section className="catalog-section">
        <div className="catalog-head">
          <h3>Choose a drive</h3>
          <span className="muted">Browse folders one level at a time</span>
        </div>
        {drives.length === 0 ? (
          <div className="catalog-empty">
            <p>No indexed drives. Run an archive scan first.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Drive</th>
                  <th>Capacity</th>
                  <th>Free</th>
                  <th>Folders</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {drives.map((d) => (
                  <tr key={d.drivePath} className="folder-row">
                    <td>
                      <button
                        type="button"
                        className="folder-open-btn"
                        onClick={() => onOpenDrive(d.drivePath)}
                      >
                        <span className="folder-icon" aria-hidden>
                          📀
                        </span>
                        {d.driveName}
                      </button>
                    </td>
                    <td>
                      {d.diskSize > 0
                        ? `${formatBytes(d.diskSize)} (${formatPercent(d.diskUsed, d.diskSize)} used)`
                        : "—"}
                    </td>
                    <td>{d.diskSize > 0 ? formatBytes(d.diskFree) : "—"}</td>
                    <td>{d.folderCount.toLocaleString()}</td>
                    <td>
                      <button
                        type="button"
                        className="btn tiny"
                        onClick={() => onOpenDrive(d.drivePath)}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="catalog-section">
      <div className="catalog-head">
        <h3>{mode === "search" ? "Index results" : "Folder contents"}</h3>
        {mode === "search" && (
          <span className="badge">
            {entries.length} / {total}
          </span>
        )}
        {mode === "browse" && (
          <span className="badge">{entries.length} folders</span>
        )}
      </div>

      {mode === "browse" && breadcrumbs.length > 0 && (
        <nav className="breadcrumbs catalog-crumbs" aria-label="Folder path">
          {breadcrumbs.map((c, i) => (
            <span key={c.path}>
              {i > 0 && <span className="sep">/</span>}
              <button type="button" onClick={() => onNavigate(c.path)}>
                {c.name}
              </button>
            </span>
          ))}
        </nav>
      )}

      {entries.length === 0 ? (
        <div className="catalog-empty">
          <p>
            {mode === "search"
              ? "No matches. Widen filters or clear the search text."
              : "No subfolders in this location."}
          </p>
        </div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{mode === "search" ? "Project / folder" : "Folder"}</th>
                {mode === "search" && <th>Drive</th>}
                {mode === "search" && <th>Path</th>}
                <th>Videos</th>
                <th>Size</th>
                <th>Last modified</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(entries as CatalogBrowseEntry[]).map((row) => {
                const browseRow = row as CatalogBrowseEntry;
                const canOpen = mode === "browse" && browseRow.hasChildren;
                return (
                  <tr
                    key={row.id}
                    className={canOpen ? "folder-row clickable" : undefined}
                  >
                    <td>
                      {mode === "browse" ? (
                        <button
                          type="button"
                          className="folder-open-btn"
                          onClick={() =>
                            browseRow.hasChildren
                              ? onOpenFolder(browseRow)
                              : void copyPath(row.folderPath)
                          }
                          title={row.folderPath}
                        >
                          <span className="folder-icon" aria-hidden>
                            {browseRow.hasChildren
                              ? "📁"
                              : row.videoCount > 0
                                ? "🎬"
                                : "📂"}
                          </span>
                          {row.title}
                        </button>
                      ) : (
                        <>
                          <strong>{row.title}</strong>
                          {row.sampleFiles.length > 0 && (
                            <div className="samples muted">
                              e.g. {row.sampleFiles.slice(0, 2).join(", ")}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    {mode === "search" && (
                      <td>
                        <span className="drive-pill">{row.driveName}</span>
                      </td>
                    )}
                    {mode === "search" && (
                      <td className="path-cell" title={row.folderPath}>
                        <span>{row.relativePath}</span>
                        {isDriveConnected(row.drivePath) && (
                          <button
                            type="button"
                            className="link-btn path-open-btn"
                            onClick={() => void onOpenInFinder(row.folderPath)}
                          >
                            Open
                          </button>
                        )}
                      </td>
                    )}
                    <td>{row.videoCount}</td>
                    <td>{formatBytes(row.totalBytes)}</td>
                    <td>{formatDate(row.latestModified)}</td>
                    <td>
                      <div className="row-actions">
                        {mode === "browse" && browseRow.hasChildren ? (
                          <button
                            type="button"
                            className="btn tiny"
                            onClick={() => onOpenFolder(browseRow)}
                          >
                            Browse
                          </button>
                        ) : null}
                        {isDriveConnected(row.drivePath) && (
                          <button
                            type="button"
                            className="btn tiny secondary"
                            onClick={() => void onOpenInFinder(row.folderPath)}
                            title="Open in Finder"
                          >
                            Finder
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn tiny"
                          onClick={() => void copyPath(row.folderPath)}
                          title="Copy full path"
                        >
                          Copy
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
