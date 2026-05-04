import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChipGroup } from '../components/ChipGroup';
import { ImageLightbox } from '../components/ImageLightbox';
import { PageSection } from '../components/PageSection';
import { UploadCard } from '../components/UploadCard';
import { api } from '../lib/api';
import type { Asset } from '../lib/types';
import { cx, fieldLabelClass, helperTextClass, inputClass, pageStackClass, primaryButtonClass } from '../components/ui';

const styleSuggestions = [
  {
    tag: '清透写真',
    snippet: '清透写真风格，肤色通透自然，光线柔和干净，面部细节真实细腻，整体气质轻盈高级。',
  },
  {
    tag: '高级杂志',
    snippet: '高级杂志封面质感，构图利落克制，人物状态松弛自信，整体呈现精致时尚的 editorial 氛围。',
  },
  {
    tag: '艺术肖像',
    snippet: '艺术肖像表达，保留真实人物神态，强调层次光影与画廊级审美，画面细节细腻耐看。',
  },
  {
    tag: '法式插画',
    snippet: '法式插画气质，线条柔和优雅，色彩轻盈克制，兼具文学感与精致留白。',
  },
  {
    tag: '胶片质感',
    snippet: '胶片质感与轻微颗粒层次，色调自然复古，保留柔和高光与富有情绪的影调过渡。',
  },
  {
    tag: '水彩插画',
    snippet: '水彩插画笔触与晕染层次，颜色柔和通透，氛围梦幻，边缘表达自然细腻。',
  },
  {
    tag: '自然光',
    snippet: '自然光照明，肤感真实柔和，明暗过渡自然，画面轻透舒展，不要生硬棚拍感。',
  },
  {
    tag: '极简留白',
    snippet: '极简留白构图，主体突出，背景克制干净，视觉重心明确，整体高级安静。',
  },
  {
    tag: '温柔奶油色',
    snippet: '温柔奶油色调，色彩柔软细腻，画面温暖治愈，整体观感细致而不过分甜腻。',
  },
  {
    tag: '轻奢氛围',
    snippet: '轻奢氛围表达，质感克制高级，细节精致，色彩与材质呈现柔和而有层次的高级感。',
  },
] as const;

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
  { value: '4', label: '4' },
  { value: '8', label: '8' },
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
  const [insertedStyleTags, setInsertedStyleTags] = useState<string[]>([]);
  const [ratio, setRatio] = useState<RatioValue>('3:4');
  const [resolution, setResolution] = useState<ResolutionValue>('1k');
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
    setInsertedStyleTags(state.styleTags ?? []);
    setPersonalAssets((state.personalReferenceAssets ?? []).slice(0, 3));
    setStyleAssets((state.styleReferenceAssets ?? []).slice(0, 3));
    setQuantity(toQuantityValue(state.quantity));
    const controls = parseControlsFromSize(state.generationParams?.size);
    setRatio(controls.ratio);
    setResolution(controls.resolution);
    navigate('.', { replace: true, state: null });
  }, [location.state, navigate]);

  const handleInsertSuggestion = (tag: string) => {
    const suggestion = styleSuggestions.find((item) => item.tag === tag);
    if (!suggestion) {
      return;
    }

    setInsertedStyleTags((current) => (current.includes(tag) ? current : [...current, tag]));
    setPrompt((currentPrompt) => appendPromptSnippet(currentPrompt, suggestion.snippet));
  };

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
      </PageSection>

      <PageSection title="描述你想要的头像风格" subtitle="每次点击灵感标签，都会把一段更完整的风格描述补充到提示词中。">
        <label className={fieldLabelClass}>
          <span>头像风格描述</span>
          <textarea
            className={`${inputClass} min-h-[150px] resize-y`}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={6}
            placeholder="例如：清透苹果系艺术头像，自然光，人物神态松弛，画面高级通透，适合社交媒体头像。"
          />
        </label>
        <ChipGroup tags={styleSuggestions.map((item) => item.tag)} onSelect={handleInsertSuggestion} />
        <p className={helperTextClass}>你可以自由补充人物气质、光线、色调、构图或想要突出的情绪表达。</p>
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
          disabled={personalAssets.length === 0 || submitting}
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
                styleTags: insertedStyleTags,
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
          {submitting ? '正在创建任务...' : '开始生成'}
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

function appendPromptSnippet(prompt: string, snippet: string) {
  const normalizedPrompt = prompt.trim();
  if (normalizedPrompt.includes(snippet)) {
    return prompt;
  }
  if (!normalizedPrompt) {
    return snippet;
  }
  return `${normalizedPrompt}\n\n${snippet}`;
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
    return { ratio: '3:4', resolution: '1k' };
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  const ratioValue = width === height ? '1:1' : width / height < 0.65 ? '9:16' : '3:4';
  const longest = Math.max(width, height);
  const resolutionValue = longest >= 3600 ? '4k' : longest >= 1900 ? '2k' : '1k';
  return { ratio: ratioValue, resolution: resolutionValue };
}

function toQuantityValue(value: number | undefined): QuantityValue {
  if (value === 2 || value === 4 || value === 8) {
    return String(value) as QuantityValue;
  }
  return '1';
}
