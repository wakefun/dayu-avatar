import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { GenerationTask } from '../lib/types';
import { PageSection } from '../components/PageSection';

const steps = ['分析个人形象', '提取风格氛围', '生成头像构图', '高清细化中'];

export function LoadingPage() {
  const { taskId = '' } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState<GenerationTask | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const response = await api.getTask(taskId);
        if (stopped) {
          return;
        }
        setTask(response.task);
        if (response.task.status === 'completed') {
          navigate(`/generate/result/${taskId}`);
          return;
        }
      } catch (requestError) {
        if (!stopped) {
          setError(requestError instanceof Error ? requestError.message : '获取任务失败');
        }
      }
    };

    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, 1500);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [navigate, taskId]);

  return (
    <div className="stack-page">
      <PageSection title="正在生成头像" subtitle="当前任务仍在处理中，你可以稍后前往任务队列查看最新进度。">
        <div className="progress-shell">
          <div className="progress-orb" />
          <strong>{task?.progress.step ?? '排队中'}</strong>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${task?.progress.percent ?? 0}%` }} />
          </div>
          <span>{task?.progress.percent ?? 0}%</span>
        </div>
      </PageSection>

      <PageSection title="步骤反馈" subtitle="生成进度会自动更新，完成后会为你跳转到结果页。">
        <div className="timeline">
          {steps.map((step) => {
            const active = task?.progress.step === step;
            const done = (task?.progress.percent ?? 0) >= ((steps.indexOf(step) + 1) / steps.length) * 100;
            return (
              <div key={step} className={`timeline-row ${active ? 'active' : ''} ${done ? 'done' : ''}`}>
                <span className="timeline-dot" />
                <p>{step}</p>
              </div>
            );
          })}
        </div>
        {error ? <div className="error-text">{error}</div> : null}
        <button type="button" className="secondary-button" onClick={() => navigate('/queue')}>
          查看任务队列
        </button>
      </PageSection>
    </div>
  );
}
