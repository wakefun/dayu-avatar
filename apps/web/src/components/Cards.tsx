import type { GalleryItem } from '../lib/types';

export function GalleryCard({ item, onOpen }: { item: GalleryItem; onOpen: (item: GalleryItem) => void }) {
  return (
    <article className="relative mb-3 break-inside-avoid">
      <button
        type="button"
        className="relative block w-full overflow-hidden rounded-[20px] border-0 bg-transparent p-0 shadow-[0_14px_32px_rgba(185,168,154,0.2)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_44px_rgba(150,125,105,0.22)] active:translate-y-0"
        onClick={() => onOpen(item)}
        aria-label="查看作品"
      >
        <img
          src={item.thumbnailUrl ?? item.imageUrl}
          alt="已保存头像作品"
          className="block h-auto w-full object-cover transition duration-500 hover:scale-[1.025]"
          style={item.width && item.height ? { aspectRatio: `${item.width} / ${item.height}` } : undefined}
        />
        {item.isFavorited ? (
          <span
            className="absolute top-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-[#ffeef6]/90 text-[18px] text-[#d75b96] shadow-[0_8px_18px_rgba(215,91,150,0.18)]"
            aria-label="已收藏"
          >
            ✿
          </span>
        ) : null}
      </button>
    </article>
  );
}
