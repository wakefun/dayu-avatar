import type { GalleryItem, HistoryItem, QueueItem } from '../lib/types';

type QueueCardProps = {
  item: QueueItem;
  onOpen: (taskId: string, status: QueueItem['status']) => void;
  onRetry: (taskId: string) => void;
};

type HistoryCardProps = {
  item: HistoryItem;
  onRegenerate: (item: HistoryItem) => void;
  onPreview: (item: HistoryItem) => void;
};

export function QueueCard({ item, onOpen, onRetry }: QueueCardProps) {
  const showProgress = item.status === 'queued' || item.status === 'processing';

  return (
    <article className="list-card">
      <div className="row-between">
        <strong className={`status-pill ${item.status}`}>{statusLabel(item.status)}</strong>
        <span>{new Date(item.createdAt).toLocaleString()}</span>
      </div>
      <p className="card-summary">{item.summary}</p>
      <small>{item.progress.step ?? (item.status === 'completed' ? '生成完成' : item.errorMessage ?? '任务已结束')}</small>
      {showProgress ? (
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${item.progress.percent}%` }} />
        </div>
      ) : null}
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

export function HistoryCard({ item, onRegenerate, onPreview }: HistoryCardProps) {
  return (
    <article className="list-card history-card">
      <div className="row-between">
        <strong className={`status-pill ${item.status}`}>{statusLabel(item.status)}</strong>
        <span>{new Date(item.createdAt).toLocaleString()}</span>
      </div>
      <div className="history-card-body">
        {item.resultImageUrl ? (
          <button type="button" className="history-thumb-button" onClick={() => onPreview(item)} aria-label="预览历史结果">
            <img src={item.resultImageUrl} alt="历史生成结果" />
          </button>
        ) : null}
        <div>
          <p className="card-summary">{item.promptSummary}</p>
          <small>
            {referenceLabel(item)} · {item.generationParams.model} · {item.generationParams.quality} · {item.generationParams.size}
          </small>
        </div>
      </div>
      <div className="card-actions single-row">
        <button type="button" className="secondary-button" onClick={() => onRegenerate(item)}>
          再次生成
        </button>
      </div>
    </article>
  );
}

export function GalleryCard({ item, onOpen }: { item: GalleryItem; onOpen: (item: GalleryItem) => void }) {
  return (
    <article className="gallery-card">
      <button type="button" className="gallery-image-button" onClick={() => onOpen(item)} aria-label="查看作品">
        <img
          src={item.thumbnailUrl ?? item.imageUrl}
          alt="已保存头像作品"
          className="gallery-image"
          style={item.width && item.height ? { aspectRatio: `${item.width} / ${item.height}` } : undefined}
        />
        {item.isFavorited ? <span className="favorite-flower" aria-label="已收藏">✿</span> : null}
      </button>
    </article>
  );
}

function referenceLabel(item: HistoryItem) {
  const personalCount = item.personalReferenceAssets.length;
  const styleCount = item.styleReferenceAssets.length;
  return styleCount > 0 ? `个人参考 ${personalCount} 张 / 风格参考 ${styleCount} 张` : `个人参考 ${personalCount} 张`;
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
