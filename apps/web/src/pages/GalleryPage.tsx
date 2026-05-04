import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GalleryCard } from '../components/Cards';
import { ImageLightbox } from '../components/ImageLightbox';
import { PageSection } from '../components/PageSection';
import { api } from '../lib/api';
import type { GalleryItem, User } from '../lib/types';
import { pageStackClass, secondaryButtonClass, softCardClass } from '../components/ui';

type GalleryPageProps = {
  onUserUpdated: (user: User) => void;
};

export function GalleryPage({ onUserUpdated }: GalleryPageProps) {
  const navigate = useNavigate();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [activeItem, setActiveItem] = useState<GalleryItem | null>(null);

  const load = async () => {
    const response = await api.getGallery();
    setItems(response.items);
    setActiveItem((current) => (current ? response.items.find((item) => item.id === current.id) ?? null : null));
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
      <PageSection title="我的图库" subtitle="这里只展示你主动保存的最终头像作品。">
        {items.length === 0 ? (
          <div className={`${softCardClass} grid gap-2.5`}>
            <strong className="text-[15px] text-[#2f2724]">还没有收藏的头像作品</strong>
            <p className="m-0 text-sm leading-6 text-[#6b5f59]">回到头像生成页，完成第一张作品后即可保存到这里。</p>
            <button type="button" className={secondaryButtonClass} onClick={() => navigate('/')}>
              去生成第一个头像
            </button>
          </div>
        ) : (
          <div className="columns-2 gap-3 [column-gap:12px]">
            {items.map((item) => (
              <GalleryCard key={item.id} item={item} onOpen={setActiveItem} />
            ))}
          </div>
        )}
      </PageSection>
      <ImageLightbox
        image={
          activeItem
            ? {
                src: activeItem.imageUrl,
                alt: '已保存头像作品',
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
                { label: '下载', href: `/api/gallery-items/${activeItem.id}/download` },
                {
                  label: '删除',
                  variant: 'danger',
                  onClick: async () => {
                    await api.deleteGallery(activeItem.id);
                    setActiveItem(null);
                    await load();
                  },
                },
              ]
            : []
        }
        onClose={() => setActiveItem(null)}
      />
    </div>
  );
}
