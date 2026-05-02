type ChipGroupProps = {
  tags: string[];
  selected: string[];
  onToggle: (tag: string) => void;
};

export function ChipGroup({ tags, selected, onToggle }: ChipGroupProps) {
  return (
    <div className="chip-group">
      {tags.map((tag) => {
        const active = selected.includes(tag);
        return (
          <button key={tag} type="button" className={`chip ${active ? 'active' : ''}`} onClick={() => onToggle(tag)}>
            {tag}
          </button>
        );
      })}
    </div>
  );
}
