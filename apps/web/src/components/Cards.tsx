import type { GalleryItem, HistoryItem, QueueItem } from '../lib/types';
import { cx, secondaryButtonClass, softCardClass } from './ui';

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
    <article className={cx(softCardClass, 'grid gap-3')}>
      <div className="flex items-center justify-between gap-3">
        <strong className={statusPillClass(item.status)}>{statusLabel(item.status)}</strong>
        <span className="text-xs text-[#6b5f59]">{new Date(item.createdAt).toLocaleString()}</span>
      </div>
      <p className="m-0 text-[15px] font-semibold text-[#2f2724]">{item.summary}</p>
      <small className="text-sm leading-6 text-[#6b5f59]">
        {item.progress.step ?? (item.status === 'completed' ? '生成完成' : item.errorMessage ?? '任务已结束')}
      </small>
      {showProgress ? (
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#e8e0db]/80">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#dcb694] to-[#a9a6d5]"
            style={{ width: `${item.progress.percent}%` }}
          />
        </div>
      ) : null}
      <div className="grid gap-2.5">
        <button type="button" className={secondaryButtonClass} onClick={() => onOpen(item.id, item.status)}>
          {item.status === 'completed' ? '查看结果' : '查看进度'}
        </button>
        {item.status === 'failed' ? (
          <button type="button" className={secondaryButtonClass} onClick={() => onRetry(item.id)}>
            重试任务
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function HistoryCard({ item, onRegenerate, onPreview }: HistoryCardProps) {
  return (
    <article className={cx(softCardClass, 'grid gap-3')}>
      <div className="flex items-center justify-between gap-3">
        <strong className={statusPillClass(item.status)}>{statusLabel(item.status)}</strong>
        <span className="text-xs text-[#6b5f59]">{new Date(item.createdAt).toLocaleString()}</span>
      </div>
      <div className="mt-1 grid grid-cols-[86px_1fr] items-center gap-3">
        {item.resultImageUrl ? (
          <button
            type="button"
            className="aspect-square overflow-hidden rounded-[18px] border-0 bg-transparent p-0"
            onClick={() => onPreview(item)}
            aria-label="预览历史结果"
          >
            <img src={item.resultImageUrl} alt="历史生成结果" className="block h-full w-full object-cover" />
          </button>
        ) : null}
        <div className="min-w-0">
          <p className="m-0 text-[15px] font-semibold text-[#2f2724]">{item.promptSummary}</p>
          <small className="mt-1 block text-sm leading-6 text-[#6b5f59]">
            {referenceLabel(item)} · {item.generationParams.model} · {item.generationParams.quality} · {item.generationParams.size}
          </small>
        </div>
      </div>
      <div className="mt-1 grid gap-2.5">
        <button type="button" className={secondaryButtonClass} onClick={() => onRegenerate(item)}>
          再次生成
        </button>
      </div>
    </article>
  );
}

export function GalleryCard({ item, onOpen }: { item: GalleryItem; onOpen: (item: GalleryItem) => void }) {
  return (
    <article className="relative mb-3 break-inside-avoid">
      <button
        type="button"
        className="relative block w-full overflow-hidden rounded-[20px] border-0 bg-transparent p-0 shadow-[0_14px_32px_rgba(185,168,154,0.2)]"
        onClick={() => onOpen(item)}
        aria-label="查看作品"
      >
        <img
          src={item.thumbnailUrl ?? item.imageUrl}
          alt="已保存头像作品"
          className="block h-auto w-full object-cover"
          style={item.width && item.height ? { aspectRatio: `${item.width} / ${item.height}` } : undefined}
        />
        {item.isFavorited ? (
          <span
            className="absolute top-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-[#ffeef6]/90 text-[18px] text-[#d75b96]"
            aria-label="已收藏"
          >
            ✿
          </span>
        ) : null}
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

function statusPillClass(status: QueueItem['status']) {
  const tone = {
    queued: 'text-[#8f7b51] bg-[rgba(228,200,135,0.18)]',
    processing: 'text-[#6d78ad] bg-[rgba(169,176,220,0.18)]',
    completed: 'text-[#668f64] bg-[rgba(152,179,145,0.18)]',
    failed: 'text-[#a66b65] bg-[rgba(179,111,103,0.16)]',
    canceled: 'text-[#82756f] bg-[rgba(130,117,111,0.13)]',
  }[status];

  return cx(
    'inline-flex items-center gap-[7px] rounded-full px-2.5 py-1.5 text-[13px] before:block before:h-[7px] before:w-[7px] before:rounded-full before:bg-current before:content-[""]',
    tone
  );
}
