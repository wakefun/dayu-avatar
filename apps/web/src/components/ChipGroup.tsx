type ChipGroupProps = {
  tags: string[];
  onSelect: (tag: string) => void;
};

export function ChipGroup({ tags, onSelect }: ChipGroupProps) {
  return (
    <div className="chip-group">
      {tags.map((tag) => (
        <button key={tag} type="button" className="chip" onClick={() => onSelect(tag)}>
          {tag}
        </button>
      ))}
    </div>
  );
}
