import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { GalleryItem, GenerationResult, GenerationTask } from '../lib/types';
import { PageSection } from '../components/PageSection';

export function ResultPage() {
  const { taskId = '' } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState<GenerationTask | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [savedItem, setSavedItem] = useState<GalleryItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [taskResponse, resultResponse, galleryResponse] = await Promise.all([
          api.getTask(taskId),
          api.getTaskResult(taskId),
          api.getGallery(),
        ]);
        setTask(taskResponse.task);
        setResult(resultResponse.result);
        const matched = galleryResponse.items.find((item) => item.generationResultId === resultResponse.result.id) ?? null;
        setSavedItem(matched);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : '获取结果失败');
      }
    })();
  }, [taskId]);

  return (
    <div className="stack-page">
      <PageSection title="生成结果" subtitle="Mock 结果与未来真实生成共用同一数据结构。">
        {result?.imageUrl ? <img className="result-image" src={result.imageUrl} alt="生成头像结果" /> : null}
        {error ? <div className="error-text">{error}</div> : null}
        <div className="action-grid">
          <button
            type="button"
            className="primary-button"
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
            <a className="secondary-button inline-link" href={`/api/gallery-items/${savedItem.id}/download`}>
              下载
            </a>
          ) : result?.imageUrl ? (
            <a className="secondary-button inline-link" href={result.imageUrl} download>
              下载
            </a>
          ) : null}
          <button
            type="button"
            className="secondary-button"
            onClick={async () => {
              const response = await api.retryTask(taskId);
              navigate(`/generate/loading/${response.task.id}`);
            }}
          >
            重新生成
          </button>
          <button type="button" className="secondary-button" onClick={() => navigate('/gallery')}>
            前往图库
          </button>
        </div>
      </PageSection>

      <PageSection title="生成参数" subtitle="展示任务详情与风格设置。">
        <dl className="detail-list">
          <div>
            <dt>提示词</dt>
            <dd>{task?.prompt || '未填写提示词'}</dd>
          </div>
          <div>
            <dt>风格标签</dt>
            <dd>{task?.styleTags.join(' / ') || '无'}</dd>
          </div>
          <div>
            <dt>模型</dt>
            <dd>{task?.generationParams.model}</dd>
          </div>
          <div>
            <dt>质量</dt>
            <dd>{task?.generationParams.quality}</dd>
          </div>
          <div>
            <dt>尺寸</dt>
            <dd>{task?.generationParams.size}</dd>
          </div>
        </dl>
      </PageSection>
    </div>
  );
}
