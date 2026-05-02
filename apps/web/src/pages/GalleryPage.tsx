import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { GalleryItem } from '../lib/types';
import { GalleryCard } from '../components/Cards';
import { PageSection } from '../components/PageSection';

export function GalleryPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<GalleryItem[]>([]);

  const load = async () => {
    const response = await api.getGallery();
    setItems(response.items);
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="stack-page">
      <PageSection title="我的图库" subtitle="这里只展示你主动保存的最终头像作品。">
        {items.length === 0 ? (
          <div className="empty-state">
            <strong>还没有收藏的头像作品</strong>
            <p>回到头像生成页，完成第一张作品后即可保存到这里。</p>
            <button type="button" className="secondary-button" onClick={() => navigate('/')}>
              去生成第一个头像
            </button>
          </div>
        ) : (
          <div className="gallery-grid">
            {items.map((item) => (
              <GalleryCard
                key={item.id}
                item={item}
                onFavorite={async (itemId, next) => {
                  await api.updateGallery(itemId, next);
                  await load();
                }}
                onDelete={async (itemId) => {
                  await api.deleteGallery(itemId);
                  await load();
                }}
              />
            ))}
          </div>
        )}
      </PageSection>
    </div>
  );
}
