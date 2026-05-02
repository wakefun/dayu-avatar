import type { GalleryItem, HistoryItem, QueueItem } from '../lib/types';

type QueueCardProps = {
  item: QueueItem;
  onOpen: (taskId: string, status: QueueItem['status']) => void;
  onRetry: (taskId: string) => void;
};

export function QueueCard({ item, onOpen, onRetry }: QueueCardProps) {
  return (
    <article className="list-card">
      <div className="row-between">
        <strong>{statusLabel(item.status)}</strong>
        <span>{new Date(item.createdAt).toLocaleString()}</span>
      </div>
      <p>{item.progress.step ?? '处理中'}</p>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${item.progress.percent}%` }} />
      </div>
      <div className="card-actions">
        <button type="button" className="secondary-button" onClick={() => onOpen(item.id, item.status)}>
          {item.status === 'completed' ? '查看结果' : '查看进度'}
        </button>
        {item.status === 'failed' ? (
          <button type="button" className="secondary-button" onClick={() => onRetry(item.id)}>
            重试任务
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function HistoryCard({ item, onRetry }: { item: HistoryItem; onRetry: (taskId: string) => void }) {
  return (
    <article className="list-card">
      <div className="row-between">
        <strong>{statusLabel(item.status)}</strong>
        <span>{new Date(item.createdAt).toLocaleString()}</span>
      </div>
      <p>{item.promptSummary}</p>
      <small>
        {item.referenceTypes.join(' / ')} · {item.generationParams.model} · {item.generationParams.quality} · {item.generationParams.size}
      </small>
      <button type="button" className="secondary-button" onClick={() => onRetry(item.id)}>
        再次生成
      </button>
    </article>
  );
}

export function GalleryCard({
  item,
  onFavorite,
  onDelete,
}: {
  item: GalleryItem;
  onFavorite: (itemId: string, next: boolean) => void;
  onDelete: (itemId: string) => void;
}) {
  return (
    <article className="gallery-card glass-card">
      <a href={`/generate/result/${item.taskId}`} aria-label="查看作品详情">
        <img src={item.thumbnailUrl ?? item.imageUrl} alt="已保存头像作品" className="gallery-image" />
      </a>
      <div className="gallery-actions">
        <a className="chip" href={`/generate/result/${item.taskId}`}>
          查看详情
        </a>
        <button type="button" className="chip" onClick={() => onFavorite(item.id, !item.isFavorited)}>
          {item.isFavorited ? '已收藏' : '收藏'}
        </button>
        <a className="chip" href={`/api/gallery-items/${item.id}/download`}>
          下载
        </a>
        <button type="button" className="chip" onClick={() => onDelete(item.id)}>
          删除
        </button>
      </div>
      <small>{new Date(item.savedAt).toLocaleString()}</small>
    </article>
  );
}

function statusLabel(status: QueueItem['status']) {
  switch (status) {
    case 'queued':
      return '排队中';
    case 'processing':
      return '生成中';
    case 'completed':
      return '已完成';
    case 'failed':
      return '已失败';
    case 'canceled':
      return '已取消';
  }
}
