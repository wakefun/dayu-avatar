import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ImageLightbox } from '../components/ImageLightbox';
import { PageSection } from '../components/PageSection';
import { api } from '../lib/api';
import type { Asset, GalleryItem, GenerationResult, GenerationTask } from '../lib/types';
import { pageStackClass, primaryButtonClass, secondaryButtonClass } from '../components/ui';

type ReferencePreview = {
  asset: Asset;
  label: string;
  index: number;
};

export function ResultPage() {
  const { taskId = '' } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState<GenerationTask | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [savedItem, setSavedItem] = useState<GalleryItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [referencePreview, setReferencePreview] = useState<ReferencePreview | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setError(null);
        setResult(null);
        setSavedItem(null);
        const taskResponse = await api.getTask(taskId);
        setTask(taskResponse.task);

        if (taskResponse.task.status === 'queued' || taskResponse.task.status === 'processing') {
          navigate(`/generate/loading/${taskId}`, { replace: true });
          return;
        }

        if (taskResponse.task.status !== 'completed') {
          setError(taskResponse.task.error?.message ?? '这个任务还没有可查看的生成结果');
          return;
        }

        const [resultResponse, galleryResponse] = await Promise.all([api.getTaskResult(taskId), api.getGallery()]);
        setResult(resultResponse.result);
        const matched = galleryResponse.items.find((item) => item.generationResultId === resultResponse.result.id) ?? null;
        setSavedItem(matched);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : '获取结果失败');
      }
    })();
  }, [navigate, taskId]);

  const resultSectionSubtitle =
    task?.status === 'failed' || task?.status === 'canceled'
      ? '这个任务没有可查看的生成结果，你可以回到生成页重新生成。'
      : '结果已准备完成，你可以保存到图库、下载原图或继续生成新的版本。';
  const personalReferenceAssets = task?.personalReferenceAssets ?? [];
  const styleReferenceAssets = task?.styleReferenceAssets ?? [];
  const hasReferenceAssets = personalReferenceAssets.length > 0 || styleReferenceAssets.length > 0;

  return (
    <div className={pageStackClass}>
      <PageSection subtitle={resultSectionSubtitle}>
        {result?.imageUrl ? (
          <button
            type="button"
            className="mb-3.5 block w-full overflow-hidden rounded-[22px] border-0 bg-transparent p-0"
            onClick={() => setPreviewOpen(true)}
            aria-label="全屏查看生成结果"
          >
            <img
              className="block h-full max-h-[68vh] w-full bg-white/45 object-contain"
              src={result.thumbnailUrl ?? result.imageUrl}
              alt="生成作品结果"
              style={result.width && result.height ? { aspectRatio: `${result.width} / ${result.height}` } : undefined}
            />
          </button>
        ) : null}
        {error ? <div className="text-sm text-[#b36f67]">{error}</div> : null}
        <div className="grid gap-3.5">
          <button
            type="button"
            className={primaryButtonClass}
            disabled={!result || !!savedItem}
            onClick={async () => {
              if (!result) {
                return;
              }
              const response = await api.saveGallery(result.id);
              setSavedItem(response.item);
            }}
          >
            {savedItem ? '已保存到图库' : '保存到图库'}
          </button>
          {savedItem ? (
            <a className={secondaryButtonClass} href={`/api/gallery-items/${savedItem.id}/download`}>
              下载原图
            </a>
          ) : result?.imageUrl ? (
            <a className={secondaryButtonClass} href={result.imageUrl} download>
              下载原图
            </a>
          ) : null}
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() => {
              if (!task) {
                return;
              }
              navigate('/', {
                state: {
                  prompt: task.prompt,
                  styleTags: task.styleTags,
                  personalReferenceAssets: task.personalReferenceAssets,
                  styleReferenceAssets: task.styleReferenceAssets,
                  generationParams: task.generationParams,
                  quantity: 1,
                },
              });
            }}
          >
            重新生成
          </button>
          <button type="button" className={secondaryButtonClass} onClick={() => navigate('/gallery')}>
            前往图库
          </button>
        </div>
      </PageSection>

      <PageSection title="生成参数" subtitle="查看本次暗房生成所使用的需求、参考图与基础参数。">
        {hasReferenceAssets ? (
          <div className="grid min-w-0 gap-3 border-b border-[#807269]/10 pb-3.5">
            {personalReferenceAssets.length > 0 ? (
              <ReferenceImageGroup
                label="原图"
                assets={personalReferenceAssets}
                onPreview={(asset, index) => setReferencePreview({ asset, label: '原图', index })}
              />
            ) : null}
            {styleReferenceAssets.length > 0 ? (
              <ReferenceImageGroup
                label="参考图"
                assets={styleReferenceAssets}
                onPreview={(asset, index) => setReferencePreview({ asset, label: '参考图', index })}
              />
            ) : null}
          </div>
        ) : null}
        <dl className="m-0">
          <div className="border-b border-[#807269]/10 py-3.5">
            <dt className="mb-1.5 font-bold text-[#2f2724]">自定义需求</dt>
            <dd className="m-0 text-sm leading-6 text-[#6b5f59]">{task?.prompt || '未填写需求文本'}</dd>
          </div>
          <div className="border-b border-[#807269]/10 py-3.5">
            <dt className="mb-1.5 font-bold text-[#2f2724]">参考图</dt>
            <dd className="m-0 text-sm leading-6 text-[#6b5f59]">
              原图 {task?.personalReferenceAssets.length ?? 0} 张
              {task?.styleReferenceAssets.length ? ` / 参考图 ${task.styleReferenceAssets.length} 张` : ''}
            </dd>
          </div>
          <div className="border-b border-[#807269]/10 py-3.5">
            <dt className="mb-1.5 font-bold text-[#2f2724]">模型</dt>
            <dd className="m-0 text-sm leading-6 text-[#6b5f59]">{task?.generationParams.model}</dd>
          </div>
          <div className="border-b border-[#807269]/10 py-3.5">
            <dt className="mb-1.5 font-bold text-[#2f2724]">质量</dt>
            <dd className="m-0 text-sm leading-6 text-[#6b5f59]">{task?.generationParams.quality}</dd>
          </div>
          <div className="py-3.5">
            <dt className="mb-1.5 font-bold text-[#2f2724]">尺寸</dt>
            <dd className="m-0 text-sm leading-6 text-[#6b5f59]">{task?.generationParams.size}</dd>
          </div>
        </dl>
      </PageSection>
      <ImageLightbox
        image={
          result?.imageUrl && previewOpen
            ? { src: result.thumbnailUrl ?? result.imageUrl, alt: '生成作品结果', width: result.width, height: result.height, meta: result.createdAt ? new Date(result.createdAt).toLocaleString() : undefined }
            : referencePreview
              ? {
                  src: referencePreview.asset.fileUrl,
                  alt: `${referencePreview.label} ${referencePreview.index + 1}`,
                  width: referencePreview.asset.width,
                  height: referencePreview.asset.height,
                }
              : null
        }
        onClose={() => {
          setPreviewOpen(false);
          setReferencePreview(null);
        }}
      />
    </div>
  );
}

type ReferenceImageGroupProps = {
  label: string;
  assets: Asset[];
  onPreview: (asset: Asset, index: number) => void;
};

function ReferenceImageGroup({ label, assets, onPreview }: ReferenceImageGroupProps) {
  return (
    <div className="grid min-w-0 gap-2">
      <div className="text-xs font-bold tracking-[0.12em] text-[#8a7a72]">{label}</div>
      <div className="flex w-full max-w-full gap-2 overflow-x-auto pb-1">
        {assets.map((asset, index) => (
          <button
            key={asset.id}
            type="button"
            className="h-20 w-20 shrink-0 overflow-hidden rounded-[18px] border border-white/80 bg-white/60 p-0 shadow-[0_8px_20px_rgba(71,55,45,0.08)]"
            onClick={() => onPreview(asset, index)}
            aria-label={`全屏查看${label} ${index + 1}`}
          >
            <img
              className="block h-full w-full object-contain"
              src={asset.fileUrl}
              alt={`${label} ${index + 1}`}
              style={asset.width && asset.height ? { aspectRatio: `${asset.width} / ${asset.height}` } : undefined}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
