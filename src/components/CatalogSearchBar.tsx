import type { ArchiveDriveView, SearchContentFilter } from "../types";

type Props = {
  query: string;
  onQueryChange: (q: string) => void;
  drivePath: string;
  onDrivePathChange: (path: string) => void;
  content: SearchContentFilter;
  onContentChange: (c: SearchContentFilter) => void;
  drives: ArchiveDriveView[];
  onClearFilters: () => void;
  filtersActive: boolean;
};

export function CatalogSearchBar({
  query,
  onQueryChange,
  drivePath,
  onDrivePathChange,
  content,
  onContentChange,
  drives,
  onClearFilters,
  filtersActive,
}: Props) {
  return (
    <div className="catalog-search-block">
      <div className="search-row">
        <input
          type="search"
          className="search-input"
          placeholder="Search folder names and paths (optional)…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        {filtersActive && (
          <button type="button" className="btn secondary" onClick={onClearFilters}>
            Clear filters
          </button>
        )}
      </div>
      <div className="search-filters">
        <label className="filter-field">
          <span>Drive</span>
          <select
            value={drivePath}
            onChange={(e) => onDrivePathChange(e.target.value)}
          >
            <option value="">All drives</option>
            {drives.map((d) => (
              <option key={d.drivePath} value={d.drivePath}>
                {d.driveName}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span>Content</span>
          <select
            value={content}
            onChange={(e) =>
              onContentChange(e.target.value as SearchContentFilter)
            }
          >
            <option value="all">All folders</option>
            <option value="withVideo">With video</option>
            <option value="noVideo">No video</option>
          </select>
        </label>
      </div>
      <p className="muted search-hint">
        Filters apply to the saved index (offline OK). Leave search empty and
        pick filters to list everything matching — not limited to video projects.
      </p>
    </div>
  );
}
