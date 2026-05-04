import { chipButtonClass } from './ui';

type ChipGroupProps = {
  tags: string[];
  onSelect: (tag: string) => void;
};

export function ChipGroup({ tags, onSelect }: ChipGroupProps) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {tags.map((tag) => (
        <button key={tag} type="button" className={chipButtonClass()} onClick={() => onSelect(tag)}>
          {tag}
        </button>
      ))}
    </div>
  );
}
