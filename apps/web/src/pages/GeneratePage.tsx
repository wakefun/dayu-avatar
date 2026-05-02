import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { Asset } from '../lib/types';
import { ChipGroup } from '../components/ChipGroup';
import { PageSection } from '../components/PageSection';
import { UploadCard } from '../components/UploadCard';

const styleTags = ['清透写真', '高级杂志', '艺术肖像', '法式插画', '胶片质感', '水彩插画', '自然光', '极简留白', '温柔奶油色', '轻奢氛围'];

export function GeneratePage() {
  const navigate = useNavigate();
  const [personalAsset, setPersonalAsset] = useState<Asset | null>(null);
  const [styleAsset, setStyleAsset] = useState<Asset | null>(null);
  const [prompt, setPrompt] = useState('清透写真 自然光 艺术肖像');
  const [selectedTags, setSelectedTags] = useState<string[]>(['清透写真', '自然光', '艺术肖像']);
  const [model, setModel] = useState('gpt-image-2');
  const [quality, setQuality] = useState('high');
  const [size, setSize] = useState('1024x1536');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const promptPreview = useMemo(() => {
    const tagText = selectedTags.join(' ');
    const manualText = prompt.trim();
    return [manualText, tagText].filter(Boolean).join(' · ');
  }, [prompt, selectedTags]);

  const toggleTag = (tag: string) => {
    setSelectedTags((current) => {
      const next = current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag];
      const uniqueWords = Array.from(new Set(next));
      setPrompt((currentPrompt) => {
        const manualWords = currentPrompt
          .split(/\s+/)
          .map((item) => item.trim())
          .filter(Boolean)
          .filter((item) => !styleTags.includes(item) || uniqueWords.includes(item));
        return Array.from(new Set([...manualWords.filter((item) => !styleTags.includes(item)), ...uniqueWords])).join(' ');
      });
      return next;
    });
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
      <PageSection title="灵感开场" subtitle="上传人物与风格参考，让头像更贴近你的气质。">
        <div className="hero-copy">
          <strong>画廊感头像创作</strong>
          <p>{promptPreview}</p>
        </div>
      </PageSection>

      <PageSection title="参考图" subtitle="两类参考图会分别参与 mock 生成流程。">
        <div className="upload-grid">
          <UploadCard
            title="个人形象参考图"
            description="保留个人五官、轮廓与气质"
            value={personalAsset ? { fileName: personalAsset.fileName, fileUrl: personalAsset.fileUrl } : null}
            onChange={(file) => void handleUpload(file, 'personal_reference')}
          />
          <UploadCard
            title="风格参考图"
            description="提供摄影风格、插画语言或氛围"
            value={styleAsset ? { fileName: styleAsset.fileName, fileUrl: styleAsset.fileUrl } : null}
            onChange={(file) => void handleUpload(file, 'style_reference')}
          />
        </div>
      </PageSection>

      <PageSection title="提示词与风格标签" subtitle="点击标签可选中或取消，并同步影响提示词。">
        <label className="field">
          <span>头像风格描述</span>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={5} placeholder="例如：清透苹果系艺术头像，自然光，画廊感" />
        </label>
        <ChipGroup tags={styleTags} selected={selectedTags} onToggle={toggleTag} />
      </PageSection>

      <PageSection title="生成参数" subtitle="保持 MVP 所需的最小参数集合。">
        <div className="form-grid">
          <label className="field">
            <span>模型</span>
            <input value={model} onChange={(event) => setModel(event.target.value)} />
          </label>
          <label className="field">
            <span>质量</span>
            <select value={quality} onChange={(event) => setQuality(event.target.value)}>
              <option value="high">high</option>
              <option value="medium">medium</option>
            </select>
          </label>
          <label className="field">
            <span>尺寸</span>
            <select value={size} onChange={(event) => setSize(event.target.value)}>
              <option value="1024x1536">1024x1536</option>
              <option value="1024x1024">1024x1024</option>
              <option value="1536x1024">1536x1024</option>
            </select>
          </label>
        </div>
        {error ? <div className="error-text">{error}</div> : null}
        <button
          type="button"
          className="primary-button sticky-action"
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
                styleTags: selectedTags,
                personalReferenceAssetId: personalAsset.id,
                styleReferenceAssetId: styleAsset?.id ?? null,
                generationParams: {
                  model,
                  quality,
                  size,
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
          {submitting ? '正在创建任务...' : '开始生成头像'}
        </button>
      </PageSection>
    </div>
  );
}
