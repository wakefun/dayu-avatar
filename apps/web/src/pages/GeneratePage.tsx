import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ImageLightbox } from '../components/ImageLightbox';
import { PageSection } from '../components/PageSection';
import { UploadCard } from '../components/UploadCard';
import { api } from '../lib/api';
import type { Asset } from '../lib/types';
import { cx, fieldLabelClass, helperTextClass, inputClass, pageStackClass, primaryButtonClass } from '../components/ui';

const ratioOptions = [
  { value: 'auto', label: '自动' },
  { value: '1:1', label: '1:1' },
  { value: '3:4', label: '3:4' },
  { value: '4:3', label: '4:3' },
  { value: '9:16', label: '9:16' },
  { value: '16:9', label: '16:9' },
  { value: '21:9', label: '21:9' },
  { value: '9:21', label: '9:21' },
  { value: 'custom', label: '自定义' },
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
type ExplicitRatioValue = Exclude<RatioValue, 'auto' | 'custom'>;
type ResolutionValue = (typeof resolutionOptions)[number]['value'];
type QuantityValue = (typeof quantityOptions)[number]['value'];

const explicitRatioOptions: Array<{ value: ExplicitRatioValue; aspectRatio: number }> = [
  { value: '1:1', aspectRatio: 1 },
  { value: '3:4', aspectRatio: 3 / 4 },
  { value: '4:3', aspectRatio: 4 / 3 },
  { value: '9:16', aspectRatio: 9 / 16 },
  { value: '16:9', aspectRatio: 16 / 9 },
  { value: '21:9', aspectRatio: 21 / 9 },
  { value: '9:21', aspectRatio: 9 / 21 },
];

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
  const [ratio, setRatio] = useState<RatioValue>('auto');
  const [customRatio, setCustomRatio] = useState('3:4');
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
    if (controls.customRatio) {
      setCustomRatio(controls.customRatio);
    }
    navigate('.', { replace: true, state: null });
  }, [location.state, navigate]);

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
      <PageSection title="原图" subtitle="上传需要保留主体、人物特征或物体细节的图片；有自定义需求时可以不上传。">
        <UploadCard
          title="原图"
          description="可上传自拍、产品、角色或任何需要保留主体特征的原始图片。"
          actionLabel="上传原图"
          iconLabel="原图"
          values={personalAssets}
          onAdd={(file) => void handleUpload(file, 'personal_reference')}
          onRemove={(assetId) => setPersonalAssets((current) => current.filter((asset) => asset.id !== assetId))}
          onPreview={setPreviewAsset}
        />
      </PageSection>

      <PageSection title="参考图" subtitle="上传想要复刻的场景、构图、摄影质感、绘画画风或整体视觉语言。">
        <UploadCard
          title="参考图"
          description="可上传摄影、插画、电影截图、海报或任何你想借鉴的视觉参考。"
          actionLabel="上传参考图"
          iconLabel="参考"
          values={styleAssets}
          onAdd={(file) => void handleUpload(file, 'style_reference')}
          onRemove={(assetId) => setStyleAssets((current) => current.filter((asset) => asset.id !== assetId))}
          onPreview={setPreviewAsset}
        />
      </PageSection>

      <PageSection title="自定义需求" subtitle="写明你最想要的最终效果；这部分优先级最高。">
        <label className={fieldLabelClass}>
          <span>需求文本</span>
          <textarea
            className={`${inputClass} min-h-[150px] resize-y`}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={6}
            placeholder="例如：提取原图人物特征，复刻参考图的赛博夜景、霓虹光线和电影感构图，整体更冷峻。"
          />
        </label>
        <p className={helperTextClass}>有需求文本时可以纯文本生成；只要上传了任意图片，就会先由 AI 理解图片并生成内部生图 prompt。</p>
      </PageSection>

      <PageSection title="生成设置" subtitle="选择比例、分辨率和生成数量。自动比例会优先匹配第一张参考图的最近常用比例，没有参考图时使用 3:4。">
        <div className="grid gap-4">
          <SegmentedControl label="图片比例" options={ratioOptions} value={ratio} onChange={setRatio} />
          {ratio === 'auto' ? <p className={helperTextClass}>当前自动比例：{describeAutoRatio(styleAssets[0])}</p> : null}
          {ratio === 'custom' ? (
            <label className={fieldLabelClass}>
              <span>自定义比例</span>
              <input
                className={inputClass}
                value={customRatio}
                onChange={(event) => setCustomRatio(event.target.value)}
                placeholder="例如 5:4、2.35:1、1080:1350"
              />
            </label>
          ) : null}
          <SegmentedControl label="图片分辨率" options={resolutionOptions} value={resolution} onChange={setResolution} />
          <SegmentedControl label="生成数量" options={quantityOptions} value={quantity} onChange={setQuantity} />
          <p className={helperTextClass}>高分辨率会按比例换算成合法尺寸，并规范到不超过像素上限的 16 倍数；数量大于 1 时会创建多条任务。</p>
        </div>
        {error ? <div className="mt-3 text-sm text-[#b36f67]">{error}</div> : null}
        <button
          type="button"
          className={cx(primaryButtonClass, 'mt-4')}
          disabled={submitting}
          onClick={async () => {
            const userPrompt = prompt.trim();
            if (!userPrompt && (personalAssets.length === 0 || styleAssets.length === 0)) {
              setError('未填写需求文本时，请同时上传原图和参考图');
              return;
            }

            const customRatioValue = ratio === 'custom' ? parseCustomRatio(customRatio) : null;
            if (ratio === 'custom' && !customRatioValue) {
              setError('请输入有效的自定义比例，例如 5:4、2.35:1 或 1080:1350');
              return;
            }

            try {
              setSubmitting(true);
              setError(null);
              const response = await api.createTask({
                prompt: userPrompt,
                styleTags: [],
                personalReferenceAssetIds: personalAssets.map((asset) => asset.id),
                styleReferenceAssetIds: styleAssets.map((asset) => asset.id),
                quantity: Number(quantity),
                generationParams: {
                  model: 'gpt-image-2',
                  quality: 'high',
                  size: normalizeImageSize(ratio, resolution, styleAssets[0], customRatioValue ?? undefined),
                  outputFormat: 'png',
                },
              });
              if ((response.tasks?.length ?? 0) > 1) {
                navigate('/records');
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
          {submitting ? '正在创建任务...' : '开始生成'}
        </button>
        <p className={`mt-3 ${helperTextClass}`}>纯文本会直接生成；包含图片时会先规划生图 prompt。预计 30-60 秒完成，可在我的记录中查看进度。</p>
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

function normalizeImageSize(
  ratio: RatioValue,
  resolution: ResolutionValue,
  referenceAsset: Asset | undefined,
  customRatio?: CustomRatioValue
) {
  const base = getResolutionBase(resolution);
  const { width, height } = getRatioDimensions(ratio, base, referenceAsset, customRatio);
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

type CustomRatioValue = {
  width: number;
  height: number;
};

function getRatioDimensions(ratio: RatioValue, base: number, referenceAsset?: Asset, customRatio?: CustomRatioValue) {
  if (ratio === 'auto') {
    return getRatioDimensions(resolveAutoRatio(referenceAsset), base);
  }
  if (ratio === 'custom') {
    if (!customRatio) {
      return getRatioDimensions('3:4', base);
    }
    return getCustomRatioDimensions(customRatio, base);
  }
  if (ratio === '1:1') {
    return { width: base, height: base };
  }
  if (ratio === '4:3') {
    return { width: base, height: (base * 3) / 4 };
  }
  if (ratio === '9:16') {
    return { width: (base * 9) / 16, height: base };
  }
  if (ratio === '16:9') {
    return { width: base, height: (base * 9) / 16 };
  }
  if (ratio === '21:9') {
    return { width: base, height: (base * 9) / 21 };
  }
  if (ratio === '9:21') {
    return { width: (base * 9) / 21, height: base };
  }
  return { width: (base * 3) / 4, height: base };
}

function getCustomRatioDimensions(customRatio: CustomRatioValue, base: number) {
  if (customRatio.width >= customRatio.height) {
    return { width: base, height: (base * customRatio.height) / customRatio.width };
  }
  return { width: (base * customRatio.width) / customRatio.height, height: base };
}

function parseCustomRatio(value: string): CustomRatioValue | null {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*[:：]\s*(\d+(?:\.\d+)?)$/);
  if (!match) {
    return null;
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  return { width, height };
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

  return fitRoundedDimensions(nextWidth, nextHeight, minPixels, maxPixels, maxAspectRatio);
}

function fitRoundedDimensions(width: number, height: number, minPixels: number, maxPixels: number, maxAspectRatio: number) {
  let nextWidth = roundDownToMultipleOf16(width);
  let nextHeight = roundDownToMultipleOf16(height);

  while (getLongShortRatio(nextWidth, nextHeight) > maxAspectRatio) {
    if (nextWidth >= nextHeight) {
      nextHeight += 16;
    } else {
      nextWidth += 16;
    }
  }

  while (nextWidth * nextHeight < minPixels) {
    if (nextWidth <= nextHeight) {
      nextWidth += 16;
    } else {
      nextHeight += 16;
    }
  }

  while (nextWidth * nextHeight > maxPixels) {
    if (nextWidth >= nextHeight) {
      nextWidth = Math.max(16, nextWidth - 16);
    } else {
      nextHeight = Math.max(16, nextHeight - 16);
    }
  }

  return {
    width: nextWidth,
    height: nextHeight,
  };
}

function getLongShortRatio(width: number, height: number) {
  return Math.max(width, height) / Math.max(1, Math.min(width, height));
}

function roundDownToMultipleOf16(value: number) {
  return Math.max(16, Math.floor(value / 16) * 16);
}

function parseControlsFromSize(size: string | undefined): { ratio: RatioValue; resolution: ResolutionValue; customRatio?: string } {
  const match = size?.match(/^(\d+)x(\d+)$/);
  if (!match) {
    return { ratio: 'auto', resolution: '2k' };
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  const aspectRatio = width / Math.max(1, height);
  const ratioValue = findNearestExplicitRatio(aspectRatio);
  const longest = Math.max(width, height);
  const resolutionValue = longest >= 3600 ? '4k' : longest >= 1900 ? '2k' : '1k';
  if (isCloseToExplicitRatio(aspectRatio, ratioValue)) {
    return { ratio: ratioValue, resolution: resolutionValue };
  }
  return { ratio: 'custom', resolution: resolutionValue, customRatio: formatCustomRatio(width, height) };
}

function describeAutoRatio(referenceAsset: Asset | undefined) {
  const resolvedRatio = resolveAutoRatio(referenceAsset);
  if (!referenceAsset?.width || !referenceAsset.height) {
    return `${resolvedRatio}（暂无参考图尺寸）`;
  }
  return `${resolvedRatio}（已匹配第一张参考图的最近常用比例）`;
}

function resolveAutoRatio(referenceAsset: Asset | undefined): ExplicitRatioValue {
  if (!referenceAsset?.width || !referenceAsset.height) {
    return '3:4';
  }
  return findNearestExplicitRatio(referenceAsset.width / referenceAsset.height);
}

function findNearestExplicitRatio(aspectRatio: number): ExplicitRatioValue {
  return explicitRatioOptions.reduce((best, next) =>
    Math.abs(Math.log(next.aspectRatio / aspectRatio)) < Math.abs(Math.log(best.aspectRatio / aspectRatio)) ? next : best
  ).value;
}

function isCloseToExplicitRatio(aspectRatio: number, ratio: ExplicitRatioValue) {
  const explicitRatio = explicitRatioOptions.find((option) => option.value === ratio)?.aspectRatio ?? 1;
  return Math.abs(Math.log(explicitRatio / aspectRatio)) < 0.03;
}

function formatCustomRatio(width: number, height: number) {
  const divisor = greatestCommonDivisor(width, height);
  const ratioWidth = width / divisor;
  const ratioHeight = height / divisor;
  return `${ratioWidth}:${ratioHeight}`;
}

function greatestCommonDivisor(first: number, second: number) {
  let a = Math.abs(Math.round(first));
  let b = Math.abs(Math.round(second));
  while (b > 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return Math.max(a, 1);
}

function toQuantityValue(value: number | undefined): QuantityValue {
  if (value === 2 || value === 3 || value === 6) {
    return String(value) as QuantityValue;
  }
  return '1';
}
