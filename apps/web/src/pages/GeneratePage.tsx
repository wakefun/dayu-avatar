import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ImageLightbox } from '../components/ImageLightbox';
import { PageSection } from '../components/PageSection';
import { UploadCard } from '../components/UploadCard';
import { api } from '../lib/api';
import type { Asset, StyleReferenceAnalysis } from '../lib/types';
import { cx, fieldLabelClass, helperTextClass, inputClass, pageStackClass, primaryButtonClass } from '../components/ui';

const ratioOptions = [
  { value: '1:1', label: '1:1' },
  { value: '3:4', label: '3:4' },
  { value: '9:16', label: '9:16' },
] as const;

const resolutionOptions = [
  { value: '1k', label: '1K' },
  { value: '2k', label: '2K' },
  { value: '4k', label: '4K' },
] as const;

const quantityOptions = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '6', label: '6' },
] as const;

type RatioValue = (typeof ratioOptions)[number]['value'];
type ResolutionValue = (typeof resolutionOptions)[number]['value'];
type QuantityValue = (typeof quantityOptions)[number]['value'];

type GeneratePrefillState = {
  prompt?: string;
  styleTags?: string[];
  personalReferenceAssets?: Asset[];
  styleReferenceAssets?: Asset[];
  generationParams?: {
    size?: string;
  };
  quantity?: number;
};

type SegmentedControlProps<T extends string> = {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

export function GeneratePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [personalAssets, setPersonalAssets] = useState<Asset[]>([]);
  const [styleAssets, setStyleAssets] = useState<Asset[]>([]);
  const [prompt, setPrompt] = useState('');
  const [styleAnalysis, setStyleAnalysis] = useState<StyleReferenceAnalysis | null>(null);
  const [styleAnalysisLoading, setStyleAnalysisLoading] = useState(false);
  const [styleAnalysisError, setStyleAnalysisError] = useState<string | null>(null);
  const [ratio, setRatio] = useState<RatioValue>('1:1');
  const [resolution, setResolution] = useState<ResolutionValue>('2k');
  const [quantity, setQuantity] = useState<QuantityValue>('1');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);

  useEffect(() => {
    const state = location.state as GeneratePrefillState | null;
    if (!state) {
      return;
    }

    setPrompt(state.prompt ?? '');
    setPersonalAssets((state.personalReferenceAssets ?? []).slice(0, 3));
    setStyleAssets((state.styleReferenceAssets ?? []).slice(0, 3));
    setQuantity(toQuantityValue(state.quantity));
    const controls = parseControlsFromSize(state.generationParams?.size);
    setRatio(controls.ratio);
    setResolution(controls.resolution);
    navigate('.', { replace: true, state: null });
  }, [location.state, navigate]);

  useEffect(() => {
    if (styleAssets.length === 0) {
      setStyleAnalysis(null);
      setStyleAnalysisError(null);
      setStyleAnalysisLoading(false);
      return;
    }

    const assetIds = styleAssets.map((asset) => asset.id);
    let canceled = false;
    setStyleAnalysisLoading(true);
    setStyleAnalysis(null);
    setStyleAnalysisError(null);

    api
      .analyzeStyleReferences(assetIds)
      .then((response) => {
        if (!canceled) {
          setStyleAnalysis(response.analysis);
        }
      })
      .catch((requestError) => {
        if (!canceled) {
          setStyleAnalysis(null);
          setStyleAnalysisError(requestError instanceof Error ? requestError.message : '风格分析失败');
        }
      })
      .finally(() => {
        if (!canceled) {
          setStyleAnalysisLoading(false);
        }
      });

    return () => {
      canceled = true;
    };
  }, [styleAssets]);

  const handleUpload = async (file: File, category: 'personal_reference' | 'style_reference') => {
    try {
      setError(null);
      const response = await api.upload(file, category);
      if (category === 'personal_reference') {
        setPersonalAssets((current) => [...current, response.asset].slice(0, 3));
        return;
      }
      setStyleAssets((current) => [...current, response.asset].slice(0, 3));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '上传失败');
    }
  };

  return (
    <div className={pageStackClass}>
      <PageSection title="个人形象参考图" subtitle="上传清晰正脸或半身照片，帮助 AI 保留你的个人特征。">
        <UploadCard
          title="个人形象参考图"
          description="建议选择光线自然、面部清晰、无遮挡的人像照片。"
          actionLabel="上传个人照片"
          iconLabel="人像"
          values={personalAssets}
          onAdd={(file) => void handleUpload(file, 'personal_reference')}
          onRemove={(assetId) => setPersonalAssets((current) => current.filter((asset) => asset.id !== assetId))}
          onPreview={setPreviewAsset}
        />
      </PageSection>

      <PageSection title="风格参考图" subtitle="上传你喜欢的艺术风格、摄影质感或头像氛围。">
        <UploadCard
          title="风格参考图"
          description="可上传插画、摄影、杂志或艺术肖像作为风格灵感。"
          actionLabel="上传风格参考"
          iconLabel="风格"
          values={styleAssets}
          onAdd={(file) => void handleUpload(file, 'style_reference')}
          onRemove={(assetId) => setStyleAssets((current) => current.filter((asset) => asset.id !== assetId))}
          onPreview={setPreviewAsset}
        />
        {styleAnalysisLoading ? <p className={helperTextClass}>正在分析参考图风格...</p> : null}
        {styleAnalysis ? (
          <div className="grid gap-3 rounded-[24px] border border-[#cfa983]/24 bg-white/64 p-4 shadow-[0_16px_34px_rgba(86,67,54,0.08)]">
            <div className="flex flex-wrap gap-2">
              {styleAnalysis.tags.map((tag) => (
                <span key={tag} className="rounded-full border border-[#cfa983]/28 bg-[#fff8f2] px-3 py-1 text-xs text-[#7a5b43]">
                  {tag}
                </span>
              ))}
            </div>
            <p className="text-sm leading-6 text-[#4d403a]">{styleAnalysis.description}</p>
          </div>
        ) : null}
        {styleAnalysisError ? <p className="text-sm text-[#b36f67]">{styleAnalysisError}</p> : null}
      </PageSection>

      <PageSection title="个性化定制" subtitle="补充你想强调的人物气质、场景、光线、色调或构图要求。">
        <label className={fieldLabelClass}>
          <span>补充需求</span>
          <textarea
            className={`${inputClass} min-h-[150px] resize-y`}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={6}
            placeholder="例如：希望更松弛自然，保留微笑，背景干净，整体适合社交媒体头像。"
          />
        </label>
        <p className={helperTextClass}>这部分会作为最高优先级需求参与生成；不填写也可以直接使用参考图风格。</p>
      </PageSection>

      <PageSection title="生成设置" subtitle="选择更接近 Stitch 的生成偏好，数量大于 1 时会并发创建多条任务，而不是在一次请求中批量返回多图。">
        <div className="grid gap-4">
          <SegmentedControl label="图片比例" options={ratioOptions} value={ratio} onChange={setRatio} />
          <SegmentedControl label="图片分辨率" options={resolutionOptions} value={resolution} onChange={setResolution} />
          <SegmentedControl label="生成数量" options={quantityOptions} value={quantity} onChange={setQuantity} />
          <p className={helperTextClass}>默认生成 1 张。高分辨率会按比例换算成合法尺寸，并规范到 16 的倍数；当数量大于 1 时，你会进入任务队列统一查看每张结果。</p>
        </div>
        {error ? <div className="mt-3 text-sm text-[#b36f67]">{error}</div> : null}
        <button
          type="button"
          className={cx(primaryButtonClass, 'mt-4')}
          disabled={personalAssets.length === 0 || submitting || styleAnalysisLoading}
          onClick={async () => {
            if (personalAssets.length === 0) {
              setError('请先上传个人形象参考图');
              return;
            }

            try {
              setSubmitting(true);
              setError(null);
              const response = await api.createTask({
                prompt,
                styleTags: styleAnalysis?.tags ?? [],
                styleReferenceAnalysis: styleAnalysis,
                personalReferenceAssetIds: personalAssets.map((asset) => asset.id),
                styleReferenceAssetIds: styleAssets.map((asset) => asset.id),
                quantity: Number(quantity),
                generationParams: {
                  model: 'gpt-image-2',
                  quality: 'high',
                  size: normalizeImageSize(ratio, resolution),
                  outputFormat: 'png',
                },
              });
              if ((response.tasks?.length ?? 0) > 1) {
                navigate('/queue');
                return;
              }
              navigate(`/generate/loading/${response.task.id}`);
            } catch (requestError) {
              setError(requestError instanceof Error ? requestError.message : '创建任务失败');
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {styleAnalysisLoading ? '正在分析风格...' : submitting ? '正在创建任务...' : '开始生成'}
        </button>
        <p className={`mt-3 ${helperTextClass}`}>预计 30-60 秒完成，可在任务队列中查看进度。</p>
      </PageSection>
      <ImageLightbox
        image={previewAsset ? { src: previewAsset.fileUrl, alt: previewAsset.fileName, width: previewAsset.width, height: previewAsset.height } : null}
        onClose={() => setPreviewAsset(null)}
      />
    </div>
  );
}

function SegmentedControl<T extends string>({ label, options, value, onChange }: SegmentedControlProps<T>) {
  return (
    <div className="grid gap-2.5">
      <span className="text-sm text-[#6b5f59]">{label}</span>
      <div className="flex flex-wrap gap-2.5" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={cx(
              'min-h-11 rounded-full border px-[18px] text-sm transition',
              option.value === value
                ? 'border-[#cfa983]/44 bg-gradient-to-br from-[#fff8f4] to-[#e9effc] text-[#2f2724]'
                : 'border-[#7a6a60]/14 bg-white/74 text-[#6b5f59] hover:bg-white'
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function normalizeImageSize(ratio: RatioValue, resolution: ResolutionValue) {
  const base = getResolutionBase(resolution);
  const { width, height } = getRatioDimensions(ratio, base);
  const normalized = normalizeSize(width, height);
  return `${normalized.width}x${normalized.height}`;
}

function getResolutionBase(resolution: ResolutionValue) {
  if (resolution === '4k') {
    return 3840;
  }
  if (resolution === '2k') {
    return 2048;
  }
  return 1024;
}

function getRatioDimensions(ratio: RatioValue, base: number) {
  if (ratio === '1:1') {
    return { width: base, height: base };
  }
  if (ratio === '9:16') {
    return { width: (base * 9) / 16, height: base };
  }
  return { width: (base * 3) / 4, height: base };
}

function normalizeSize(width: number, height: number) {
  const maxEdge = 3840;
  const minPixels = 655_360;
  const maxPixels = 8_294_400;
  const maxAspectRatio = 3;

  let nextWidth = width;
  let nextHeight = height;

  const longestEdge = Math.max(nextWidth, nextHeight);
  if (longestEdge > maxEdge) {
    const scale = maxEdge / longestEdge;
    nextWidth *= scale;
    nextHeight *= scale;
  }

  const aspectRatio = Math.max(nextWidth, nextHeight) / Math.max(1, Math.min(nextWidth, nextHeight));
  if (aspectRatio > maxAspectRatio) {
    if (nextWidth >= nextHeight) {
      nextWidth = nextHeight * maxAspectRatio;
    } else {
      nextHeight = nextWidth * maxAspectRatio;
    }
  }

  const pixels = nextWidth * nextHeight;
  if (pixels > maxPixels) {
    const scale = Math.sqrt(maxPixels / pixels);
    nextWidth *= scale;
    nextHeight *= scale;
  } else if (pixels < minPixels) {
    const scale = Math.sqrt(minPixels / Math.max(pixels, 1));
    nextWidth *= scale;
    nextHeight *= scale;
  }

  return {
    width: roundToMultipleOf16(nextWidth),
    height: roundToMultipleOf16(nextHeight),
  };
}

function roundToMultipleOf16(value: number) {
  return Math.max(16, Math.round(value / 16) * 16);
}

function parseControlsFromSize(size: string | undefined): { ratio: RatioValue; resolution: ResolutionValue } {
  const match = size?.match(/^(\d+)x(\d+)$/);
  if (!match) {
    return { ratio: '1:1', resolution: '2k' };
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  const ratioValue = width === height ? '1:1' : width / height < 0.65 ? '9:16' : '3:4';
  const longest = Math.max(width, height);
  const resolutionValue = longest >= 3600 ? '4k' : longest >= 1900 ? '2k' : '1k';
  return { ratio: ratioValue, resolution: resolutionValue };
}

function toQuantityValue(value: number | undefined): QuantityValue {
  if (value === 2 || value === 3 || value === 6) {
    return String(value) as QuantityValue;
  }
  return '1';
}
