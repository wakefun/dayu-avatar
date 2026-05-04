import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QueueCard } from '../components/Cards';
import { PageSection } from '../components/PageSection';
import { api } from '../lib/api';
import type { QueueItem } from '../lib/types';
import { pageStackClass } from '../components/ui';

export function QueuePage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<QueueItem[]>([]);

  const load = async () => {
    const response = await api.getQueue();
    setItems(response.items);
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 2000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className={pageStackClass}>
      <PageSection title="任务队列" subtitle="查看排队中、生成中、已完成、已失败与已取消的任务。">
        <div className="grid gap-3.5">
          {items.map((item) => (
            <QueueCard
              key={item.id}
              item={item}
              onOpen={(taskId, status) => navigate(status === 'completed' ? `/generate/result/${taskId}` : `/generate/loading/${taskId}`)}
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
