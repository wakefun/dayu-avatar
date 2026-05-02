import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HistoryCard } from '../components/Cards';
import { PageSection } from '../components/PageSection';
import { api } from '../lib/api';
import type { HistoryItem } from '../lib/types';

export function HistoryPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<HistoryItem[]>([]);

  useEffect(() => {
    void (async () => {
      const response = await api.getHistory();
      setItems(response.items);
    })();
  }, []);

  return (
    <div className="stack-page">
      <PageSection title="历史记录" subtitle="保存所有生成行为，包括成功、失败、取消与重复生成。">
        <div className="list-stack">
          {items.map((item) => (
            <HistoryCard
              key={item.id}
              item={item}
              onRetry={async (taskId) => {
                const response = await api.retryTask(taskId);
                navigate(`/generate/loading/${response.task.id}`);
              }}
            />
          ))}
        </div>
      </PageSection>
    </div>
  );
}
