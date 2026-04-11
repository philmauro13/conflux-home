interface Props {
  query: string;
  onQueryChange: (query: string) => void;
}

export default function VaultSearchBar({ query, onQueryChange }: Props) {
  return (
    <div className="vault-search-bar">
      <div className="vault-search-wrapper">
        <span className="vault-search-icon">🔍</span>
        <input
          type="text"
          className="vault-search-input"
          placeholder="Search files, projects, prompts..."
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        {query && (
          <button className="vault-chip-remove" onClick={() => onQueryChange('')} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--vault-text-dim)', cursor: 'pointer', fontSize: 16 }}>
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
