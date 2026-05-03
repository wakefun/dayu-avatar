import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChipGroup } from '../components/ChipGroup';
import { PageSection } from '../components/PageSection';
import { UploadCard } from '../components/UploadCard';
import { api } from '../lib/api';
import type { Asset } from '../lib/types';

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
  { value: '4', label: '4' },
  { value: '8', label: '8' },
] as const;

type RatioValue = (typeof ratioOptions)[number]['value'];
type ResolutionValue = (typeof resolutionOptions)[number]['value'];
type QuantityValue = (typeof quantityOptions)[number]['value'];

type SegmentedControlProps<T extends string> = {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

export function GeneratePage() {
  const navigate = useNavigate();
  const [personalAsset, setPersonalAsset] = useState<Asset | null>(null);
  const [styleAsset, setStyleAsset] = useState<Asset | null>(null);
  const [prompt, setPrompt] = useState('');
  const [insertedStyleTags, setInsertedStyleTags] = useState<string[]>([]);
  const [ratio, setRatio] = useState<RatioValue>('3:4');
  const [resolution, setResolution] = useState<ResolutionValue>('1k');
  const [quantity, setQuantity] = useState<QuantityValue>('4');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewAsset = personalAsset ?? styleAsset;

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
        setPersonalAsset(response.asset);
        return;
      }
      setStyleAsset(response.asset);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '上传失败');
    }
  };

  return (
    <div className="stack-page">
      <section className="section glass-card home-hero">
        <div className="home-hero-copy">
          <span className="eyebrow">大宇头像</span>
          <h2 className="home-hero-title">生成头像</h2>
          <p className="home-hero-description">上传人物与风格参考，生成适合社交媒体与个人表达的高级头像作品。</p>
        </div>
        <div className="hero-art-frame">
          {previewAsset ? (
            <img className="hero-art-image" src={previewAsset.fileUrl} alt={previewAsset.fileName} />
          ) : (
            <div className="hero-art-placeholder" aria-hidden="true">
              <div className="hero-art-orb" />
              <div className="avatar-mark large">AI</div>
            </div>
          )}
        </div>
      </section>

      <PageSection title="个人形象参考图" subtitle="上传清晰正脸或半身照片，帮助 AI 保留你的个人特征。">
        <UploadCard
          title="个人形象参考图"
          description="建议选择光线自然、面部清晰、无遮挡的人像照片。"
          actionLabel="上传个人照片"
          iconLabel="人像"
          value={personalAsset ? { fileName: personalAsset.fileName, fileUrl: personalAsset.fileUrl } : null}
          onChange={(file) => void handleUpload(file, 'personal_reference')}
        />
      </PageSection>

      <PageSection title="风格参考图" subtitle="上传你喜欢的艺术风格、摄影质感或头像氛围。">
        <UploadCard
          title="风格参考图"
          description="可上传插画、摄影、杂志或艺术肖像作为风格灵感。"
          actionLabel="上传风格参考"
          iconLabel="风格"
          value={styleAsset ? { fileName: styleAsset.fileName, fileUrl: styleAsset.fileUrl } : null}
          onChange={(file) => void handleUpload(file, 'style_reference')}
        />
      </PageSection>

      <PageSection title="描述你想要的头像风格" subtitle="每次点击灵感标签，都会把一段更完整的风格描述补充到提示词中。">
        <label className="field">
          <span>头像风格描述</span>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={6}
            placeholder="例如：清透苹果系艺术头像，自然光，人物神态松弛，画面高级通透，适合社交媒体头像。"
          />
        </label>
        <ChipGroup tags={styleSuggestions.map((item) => item.tag)} onSelect={handleInsertSuggestion} />
        <p className="prompt-helper">你可以自由补充人物气质、光线、色调、构图或想要突出的情绪表达。</p>
      </PageSection>

      <PageSection title="生成设置" subtitle="选择更接近 Stitch 的生成偏好，当前 MVP 仍以稳定的高清单图输出为主。">
        <div className="settings-stack">
          <SegmentedControl label="图片比例" options={ratioOptions} value={ratio} onChange={setRatio} />
          <SegmentedControl label="图片分辨率" options={resolutionOptions} value={resolution} onChange={setResolution} />
          <SegmentedControl label="生成数量" options={quantityOptions} value={quantity} onChange={setQuantity} />
          <p className="section-helper">当前 MVP 每次提交稳定返回 1 张最终成图；2K / 4K 与 4 / 8 作为偏好选项已保留，后续可接入更完整的多图与高分辨率能力。</p>
        </div>
        {error ? <div className="error-text">{error}</div> : null}
        <button
          type="button"
          className="primary-button primary-cta"
          disabled={!personalAsset || submitting}
          onClick={async () => {
            if (!personalAsset) {
              setError('请先上传个人形象参考图');
              return;
            }

            try {
              setSubmitting(true);
              setError(null);
              const response = await api.createTask({
                prompt,
                styleTags: insertedStyleTags,
                personalReferenceAssetId: personalAsset.id,
                styleReferenceAssetId: styleAsset?.id ?? null,
                generationParams: {
                  model: 'gpt-image-2',
                  quality: 'high',
                  size: mapRatioToSize(ratio, resolution),
                  outputFormat: 'png',
                },
              });
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
        <p className="section-helper">预计 30-60 秒完成，可在任务队列中查看进度。</p>
      </PageSection>
    </div>
  );
}

function SegmentedControl<T extends string>({ label, options, value, onChange }: SegmentedControlProps<T>) {
  return (
    <div className="segmented-field">
      <span className="segmented-label">{label}</span>
      <div className="segmented-control" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`segmented-option ${option.value === value ? 'active' : ''}`}
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

function mapRatioToSize(ratio: RatioValue, resolution: ResolutionValue) {
  if (resolution !== '1k') {
    return mapRatioToSize(ratio, '1k');
  }
  if (ratio === '1:1') {
    return '1024x1024';
  }
  if (ratio === '9:16') {
    return '1024x1792';
  }
  return '1024x1536';
}
