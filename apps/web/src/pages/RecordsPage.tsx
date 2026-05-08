import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ImageLightbox } from '../components/ImageLightbox';
import { PageSection } from '../components/PageSection';
import { api } from '../lib/api';
import type { RecordItem, RecordsResponse } from '../lib/types';
import { chipButtonClass, cx, pageStackClass, primaryButtonClass, softCardClass } from '../components/ui';

const pageSize = 10;

export function RecordsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<RecordItem[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<RecordItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RecordItem | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  const mergeFirstPage = useCallback((response: RecordsResponse) => {
    setItems((current) => {
      const rest = current.filter((item) => !response.items.some((nextItem) => nextItem.id === item.id));
      return [...response.items, ...rest].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    });
    setNextCursor((current) => (current === 0 || current === null ? response.pagination.nextCursor : current));
  }, []);

  const loadPage = useCallback(async () => {
    if (loadingRef.current || nextCursor === null) {
      return;
    }

    loadingRef.current = true;
    setLoading(true);
    try {
      setError(null);
      const response = await api.getRecords(nextCursor, pageSize);
      setItems((current) => [...current, ...response.items.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setNextCursor(response.pagination.nextCursor);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '获取记录失败');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [nextCursor]);

  useEffect(() => {
    void loadPage();
  }, []);

  useEffect(() => {
    const eventSource = api.streamRecords();
    eventSource.addEventListener('records', (event) => {
      mergeFirstPage(JSON.parse(event.data) as RecordsResponse);
    });
    eventSource.addEventListener('error', () => {
      eventSource.close();
    });
    return () => eventSource.close();
  }, [mergeFirstPage]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadPage();
        }
      },
      { rootMargin: '180px 0px' }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [loadPage]);

  const regenerate = (item: RecordItem) => {
    navigate('/', {
      state: {
        prompt: item.prompt,
        styleTags: item.styleTags,
        personalReferenceAssets: item.personalReferenceAssets,
        styleReferenceAssets: item.styleReferenceAssets,
        generationParams: item.generationParams,
        quantity: 1,
      },
    });
  };

  const deleteFailedRecord = async (item: RecordItem) => {
    try {
      setError(null);
      await api.deleteRecord(item.id);
      setItems((current) => current.filter((record) => record.id !== item.id));
      setDeleteTarget(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '删除记录失败');
    }
  };

  return (
    <div className={pageStackClass}>
      <PageSection title="我的记录" subtitle="生成进度、历史结果和再次创作入口合并在这里，默认按 10 条逐页加载。">
        <div className="grid gap-3.5">
          {items.length === 0 && !loading ? (
            <div className={`${softCardClass} grid gap-3 py-6 text-center`}>
              <strong className="text-[15px] text-[#2f2724]">还没有生成记录</strong>
              <p className="m-0 text-sm leading-6 text-[#6b5f59]">完成第一张暗房作品后，进度、结果和再次生成入口都会出现在这里。</p>
              <button type="button" className={primaryButtonClass} onClick={() => navigate('/')}>
                开始生成
              </button>
            </div>
          ) : (
            items.map((item, index) => (
              <RecordCard
                key={item.id}
                item={item}
                index={index}
                onPreview={setPreviewItem}
                onOpen={(record) => navigate(record.status === 'completed' ? `/generate/result/${record.id}` : `/generate/loading/${record.id}`)}
                onRetry={async (record) => {
                  const response = await api.retryTask(record.id);
                  navigate(`/generate/loading/${response.task.id}`);
                }}
                onRegenerate={regenerate}
                onDelete={setDeleteTarget}
              />
            ))
          )}
          {error ? <div className="text-sm text-[#b36f67]">{error}</div> : null}
          <div ref={loadMoreRef} className="min-h-8 text-center text-sm text-[#8a7c74]">
            {loading ? '正在加载更多记录...' : nextCursor === null && items.length > 0 ? '已经到底了' : ''}
          </div>
        </div>
      </PageSection>
      <ImageLightbox
        image={
          previewItem?.result?.imageUrl
            ? {
                src: previewItem.result.thumbnailUrl ?? previewItem.result.imageUrl,
                alt: previewItem.promptSummary,
                width: previewItem.result.width,
                height: previewItem.result.height,
                meta: new Date(previewItem.createdAt).toLocaleString(),
              }
            : null
        }
        actions={buildPreviewActions(previewItem, regenerate)}
        onClose={() => setPreviewItem(null)}
      />
      <DeleteRecordDialog
        item={deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={(item) => void deleteFailedRecord(item)}
      />
    </div>
  );
}

type DeleteRecordDialogProps = {
  item: RecordItem | null;
  onCancel: () => void;
  onConfirm: (item: RecordItem) => void;
};

function DeleteRecordDialog({ item, onCancel, onConfirm }: DeleteRecordDialogProps) {
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
      aria-labelledby="delete-record-title"
      aria-describedby="delete-record-description"
      onClick={onCancel}
    >
      <div
        className="relative grid w-full max-w-[360px] gap-4 overflow-hidden rounded-[28px] border border-white/72 bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(255,244,236,0.88))] p-5 text-center shadow-[0_28px_72px_rgba(42,32,28,0.28),inset_0_1px_0_rgba(255,255,255,0.9)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="pointer-events-none absolute -top-14 left-1/2 h-28 w-28 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(179,111,103,0.18),transparent_68%)] blur-sm" />
        <div className="relative mx-auto grid h-12 w-12 place-items-center rounded-full bg-[rgba(179,111,103,0.12)] text-xl text-[#b36f67] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
          !
        </div>
        <div className="relative grid gap-2">
          <h2 id="delete-record-title" className="m-0 text-lg font-semibold text-[#2f2724]">
            删除这条失败记录？
          </h2>
          <p id="delete-record-description" className="m-0 text-sm leading-6 text-[#6b5f59]">
            “{item.promptSummary}” 将从我的记录中移除，删除后无法恢复。
          </p>
        </div>
        <div className="relative flex flex-wrap justify-center gap-2.5">
          <button ref={cancelButtonRef} type="button" className={chipButtonClass()} onClick={onCancel}>
            先保留
          </button>
          <button type="button" className={chipButtonClass('danger')} onClick={() => onConfirm(item)}>
            确认删除
          </button>
        </div>
      </div>
    </div>
  );
}

type RecordAction = {
  label: string;
  onClick?: () => void;
  href?: string;
  download?: boolean;
  variant?: 'primary' | 'danger' | 'secondary';
};

function buildPreviewActions(item: RecordItem | null, regenerate: (item: RecordItem) => void): RecordAction[] {
  if (!item) {
    return [];
  }

  const actions: RecordAction[] = [];
  if (item.result?.imageUrl) {
    actions.push({ label: '下载原图', href: item.result.imageUrl, download: true });
  }
  if (!isActiveStatus(item.status)) {
    actions.push({ label: '再次生成', onClick: () => regenerate(item), variant: 'primary' });
  }
  return actions;
}

type RecordCardProps = {
  item: RecordItem;
  index: number;
  onOpen: (item: RecordItem) => void;
  onRetry: (item: RecordItem) => void;
  onRegenerate: (item: RecordItem) => void;
  onPreview: (item: RecordItem) => void;
  onDelete: (item: RecordItem) => void;
};

function RecordCard({ item, index, onOpen, onRetry, onRegenerate, onPreview, onDelete }: RecordCardProps) {
  const showProgress = isActiveStatus(item.status);
  const resultImage = item.result?.thumbnailUrl ?? item.result?.imageUrl ?? null;
  const statusMessage = showProgress
    ? item.progress.step ?? '排队中'
    : item.status === 'completed'
      ? '生成完成'
      : item.errorMessage ?? '任务已结束';

  return (
    <article
      className={cx(
        softCardClass,
        'animate-[dayu-card-enter_360ms_ease_both] group relative isolate grid gap-3 overflow-hidden transition duration-300 hover:-translate-y-0.5'
      )}
      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
    >
      <div className="pointer-events-none absolute -top-12 -right-10 -z-10 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(255,246,236,0.92),rgba(225,232,252,0.38)_58%,transparent_72%)] blur-sm" />
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <strong className={statusPillClass(item.status)}>{statusLabel(item.status)}</strong>
        <span className="shrink-0 text-right text-xs leading-5 text-[#6b5f59]">{new Date(item.createdAt).toLocaleString()}</span>
      </div>
      <div className={cx('grid items-center gap-3', resultImage ? 'grid-cols-[92px_1fr]' : 'grid-cols-1')}>
        {resultImage ? (
          <button
            type="button"
            className="aspect-square overflow-hidden rounded-[20px] border border-white/70 bg-white/50 p-0 shadow-[0_16px_34px_rgba(108,88,72,0.16)] transition duration-300 group-hover:shadow-[0_20px_42px_rgba(108,88,72,0.22)]"
            onClick={() => onPreview(item)}
            aria-label="预览记录结果"
          >
            <img src={resultImage} alt="生成记录预览" className="block h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]" />
          </button>
        ) : null}
        <div className="min-w-0">
          <p className="m-0 text-[15px] font-semibold leading-6 text-[#2f2724]">{item.promptSummary}</p>
          <small className="mt-1 block text-sm leading-6 text-[#6b5f59]">
            {referenceLabel(item)} · {item.generationParams.quality} · {item.generationParams.size}
          </small>
          <small className="mt-1 block text-sm leading-6 text-[#8a7c74]">{statusMessage}</small>
        </div>
      </div>
      {showProgress ? (
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#e8e0db]/80 shadow-inner">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#dcb694] via-[#f0cfb0] to-[#a9a6d5] transition-all duration-500"
            style={{ width: `${item.progress.percent}%` }}
          />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2.5 pt-1">
        {item.status === 'completed' ? (
          <button type="button" className={chipButtonClass()} onClick={() => onOpen(item)}>
            查看结果
          </button>
        ) : showProgress ? (
          <button type="button" className={chipButtonClass()} onClick={() => onOpen(item)}>
            查看进度
          </button>
        ) : null}
        {item.status === 'failed' ? (
          <>
            <button type="button" className={chipButtonClass()} onClick={() => onRetry(item)}>
              重试任务
            </button>
            <button type="button" className={chipButtonClass('danger')} onClick={() => onDelete(item)}>
              删除记录
            </button>
          </>
        ) : null}
        {!showProgress ? (
          <button type="button" className={chipButtonClass()} onClick={() => onRegenerate(item)}>
            再次生成
          </button>
        ) : null}
      </div>
    </article>
  );
}

function referenceLabel(item: RecordItem) {
  const personalCount = item.personalReferenceAssets.length;
  const styleCount = item.styleReferenceAssets.length;
  if (personalCount > 0 && styleCount > 0) {
    return `原图 ${personalCount} 张 / 参考图 ${styleCount} 张`;
  }
  if (personalCount > 0) {
    return `原图 ${personalCount} 张`;
  }
  if (styleCount > 0) {
    return `参考图 ${styleCount} 张`;
  }
  return '纯文本生成';
}

function isActiveStatus(status: RecordItem['status']) {
  return status === 'queued' || status === 'processing';
}

function statusLabel(status: RecordItem['status']) {
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

function statusPillClass(status: RecordItem['status']) {
  const tone = {
    queued: 'text-[#8f7b51] bg-[rgba(228,200,135,0.18)]',
    processing: 'text-[#6d78ad] bg-[rgba(169,176,220,0.18)]',
    completed: 'text-[#668f64] bg-[rgba(152,179,145,0.18)]',
    failed: 'text-[#a66b65] bg-[rgba(179,111,103,0.16)]',
    canceled: 'text-[#82756f] bg-[rgba(130,117,111,0.13)]',
  }[status];

  return cx(
    'inline-flex items-center gap-[7px] rounded-full px-2.5 py-1.5 text-[13px] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] before:block before:h-[7px] before:w-[7px] before:rounded-full before:bg-current before:content-[""]',
    tone
  );
}
