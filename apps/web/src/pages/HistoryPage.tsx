import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HistoryCard } from '../components/Cards';
import { ImageLightbox } from '../components/ImageLightbox';
import { PageSection } from '../components/PageSection';
import { pageStackClass, primaryButtonClass, softCardClass } from '../components/ui';
import { api } from '../lib/api';
import type { HistoryItem } from '../lib/types';

export function HistoryPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [previewItem, setPreviewItem] = useState<HistoryItem | null>(null);

  useEffect(() => {
    void (async () => {
      const response = await api.getHistory();
      setItems(response.items);
    })();
  }, []);

  return (
    <div className={pageStackClass}>
      <PageSection title="历史记录" subtitle="保存所有生成行为，包括成功、失败、取消与重复生成。">
        <div className="grid gap-3.5">
          {items.length === 0 ? (
            <div className={`${softCardClass} grid gap-3 py-6 text-center`}>
              <strong className="text-[15px] text-[#2f2724]">还没有生成历史</strong>
              <p className="m-0 text-sm leading-6 text-[#6b5f59]">完成的头像、失败记录和再次生成入口都会保存在这里。</p>
              <button type="button" className={primaryButtonClass} onClick={() => navigate('/')}>
                开始生成
              </button>
            </div>
          ) : (
            items.map((item) => (
              <HistoryCard
                key={item.id}
                item={item}
                onPreview={setPreviewItem}
                onRegenerate={(historyItem) => {
                  navigate('/', {
                    state: {
                      prompt: historyItem.prompt,
                      styleTags: historyItem.styleTags,
                      personalReferenceAssets: historyItem.personalReferenceAssets,
                      styleReferenceAssets: historyItem.styleReferenceAssets,
                      generationParams: historyItem.generationParams,
                      quantity: 1,
                    },
                  });
                }}
              />
            ))
          )}
        </div>
      </PageSection>
      <ImageLightbox
        image={
          previewItem?.resultImageUrl
            ? {
                src: previewItem.resultImageUrl,
                alt: previewItem.promptSummary,
                meta: new Date(previewItem.createdAt).toLocaleString(),
              }
            : null
        }
        actions={
          previewItem
            ? [
                {
                  label: '再次生成',
                  onClick: () =>
                    navigate('/', {
                      state: {
                        prompt: previewItem.prompt,
                        styleTags: previewItem.styleTags,
                        personalReferenceAssets: previewItem.personalReferenceAssets,
                        styleReferenceAssets: previewItem.styleReferenceAssets,
                        generationParams: previewItem.generationParams,
                        quantity: 1,
                      },
                    }),
                },
              ]
            : []
        }
        onClose={() => setPreviewItem(null)}
      />
    </div>
  );
}
