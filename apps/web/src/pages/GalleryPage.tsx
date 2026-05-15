import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GalleryCard } from '../components/Cards';
import { ImageLightbox } from '../components/ImageLightbox';
import { PageSection } from '../components/PageSection';
import { api } from '../lib/api';
import type { GalleryItem, User } from '../lib/types';
import { chipButtonClass, pageStackClass, secondaryButtonClass, softCardClass } from '../components/ui';

type GalleryPageProps = {
  onUserUpdated: (user: User) => void;
};

export function GalleryPage({ onUserUpdated }: GalleryPageProps) {
  const navigate = useNavigate();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [activeItem, setActiveItem] = useState<GalleryItem | null>(null);
  const [removeTarget, setRemoveTarget] = useState<GalleryItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const response = await api.getGallery();
    setItems(response.items);
    setActiveItem((current) => (current ? response.items.find((item) => item.id === current.id) ?? null : null));
  };

  const removeFromGallery = async (item: GalleryItem) => {
    try {
      setError(null);
      await api.deleteGallery(item.id);
      setActiveItem(null);
      setRemoveTarget(null);
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '移出图库失败');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const updateFavorite = async (item: GalleryItem) => {
    await api.updateGallery(item.id, !item.isFavorited);
    await load();
  };

  return (
    <div className={pageStackClass}>
      <PageSection title="我的图库" subtitle="这里只展示你主动保存的最终图片作品。">
        {items.length === 0 ? (
          <div className={`${softCardClass} grid gap-2.5`}>
            <strong className="text-[15px] text-[#2f2724]">还没有收藏的图片作品</strong>
            <p className="m-0 text-sm leading-6 text-[#6b5f59]">回到大宇图片，完成第一张作品后即可保存到这里。</p>
            <button type="button" className={secondaryButtonClass} onClick={() => navigate('/')}>
              去生成第一个作品
            </button>
          </div>
        ) : (
          <div className="columns-2 gap-3 [column-gap:12px]">
            {items.map((item) => (
              <GalleryCard key={item.id} item={item} onOpen={setActiveItem} />
            ))}
          </div>
        )}
        {error ? <div className="mt-3 text-sm text-[#b36f67]">{error}</div> : null}
      </PageSection>
      <ImageLightbox
        image={
          activeItem
            ? {
                src: activeItem.thumbnailUrl ?? activeItem.imageUrl,
                alt: '已保存图片作品',
                width: activeItem.width,
                height: activeItem.height,
                meta: `生成时间 ${new Date(activeItem.savedAt).toLocaleString()}`,
              }
            : null
        }
        actions={
          activeItem
            ? [
                { label: activeItem.isFavorited ? '取消收藏' : '收藏', onClick: () => void updateFavorite(activeItem) },
                {
                  label: '设置为我的头像',
                  variant: 'primary',
                  onClick: async () => {
                    const response = await api.setAvatarFromGallery(activeItem.id);
                    onUserUpdated(response.user);
                  },
                },
                { label: '查看记录', onClick: () => navigate(`/generate/result/${activeItem.taskId}`), variant: 'primary' },
                { label: '下载原图', href: `/api/gallery-items/${activeItem.id}/download` },
                {
                  label: '移出图库',
                  variant: 'danger',
                  onClick: () => setRemoveTarget(activeItem),
                },
              ]
            : []
        }
        onClose={() => setActiveItem(null)}
      />
      <RemoveGalleryDialog
        item={removeTarget}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={(item) => void removeFromGallery(item)}
      />
    </div>
  );
}

type RemoveGalleryDialogProps = {
  item: GalleryItem | null;
  onCancel: () => void;
  onConfirm: (item: GalleryItem) => void;
};

function RemoveGalleryDialog({ item, onCancel, onConfirm }: RemoveGalleryDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!item) {
      return;
    }

    cancelButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [item, onCancel]);

  if (!item) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-[rgba(33,27,24,0.54)] px-[18px] pt-[max(18px,env(safe-area-inset-top))] pb-[max(18px,env(safe-area-inset-bottom))] backdrop-blur-[10px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="remove-gallery-title"
      aria-describedby="remove-gallery-description"
      onClick={onCancel}
    >
      <div
        className="relative grid w-full max-w-[360px] gap-4 overflow-hidden rounded-[28px] border border-white/72 bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(255,244,236,0.88))] p-5 text-center shadow-[0_28px_72px_rgba(42,32,28,0.28),inset_0_1px_0_rgba(255,255,255,0.9)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative mx-auto grid h-12 w-12 place-items-center rounded-full bg-[rgba(179,111,103,0.12)] text-xl text-[#b36f67] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
          !
        </div>
        <div className="relative grid gap-2">
          <h2 id="remove-gallery-title" className="m-0 text-lg font-semibold text-[#2f2724]">
            移出图库？
          </h2>
          <p id="remove-gallery-description" className="m-0 text-sm leading-6 text-[#6b5f59]">
            这张作品会从我的图库中移除，原始记录和静态图片文件仍会保留。
          </p>
        </div>
        <div className="relative flex flex-wrap justify-center gap-2.5">
          <button ref={cancelButtonRef} type="button" className={chipButtonClass()} onClick={onCancel}>
            先保留
          </button>
          <button type="button" className={chipButtonClass('danger')} onClick={() => onConfirm(item)}>
            确认移出
          </button>
        </div>
      </div>
    </div>
  );
}
