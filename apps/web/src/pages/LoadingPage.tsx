import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageSection } from '../components/PageSection';
import { api } from '../lib/api';
import type { GenerationTask } from '../lib/types';
import { pageStackClass, secondaryButtonClass } from '../components/ui';
import { cx } from '../components/ui';

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
    <div className={pageStackClass}>
      <PageSection title="正在生成头像" subtitle="当前任务仍在处理中，你可以稍后前往任务队列查看最新进度。">
        <div className="grid justify-items-center gap-3 text-center">
          <div className="aspect-square w-[120px] rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.92),rgba(222,230,249,0.82)_45%,rgba(244,213,191,0.78)_80%)] shadow-[inset_0_0_30px_rgba(255,255,255,0.68),0_20px_36px_rgba(203,178,160,0.28)]" />
          <strong className="text-[15px] text-[#2f2724]">{task?.progress.step ?? '排队中'}</strong>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#e8e0db]/80">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#dcb694] to-[#a9a6d5]"
              style={{ width: `${task?.progress.percent ?? 0}%` }}
            />
          </div>
          <span className="text-sm text-[#6b5f59]">{task?.progress.percent ?? 0}%</span>
        </div>
      </PageSection>

      <PageSection title="步骤反馈" subtitle="生成进度会自动更新，完成后会为你跳转到结果页。">
        <div className="grid gap-1">
          {steps.map((step, index) => {
            const active = task?.progress.step === step;
            const done = (task?.progress.percent ?? 0) >= ((index + 1) / steps.length) * 100;
            return (
              <div key={step} className="flex items-center gap-3 py-3">
                <span
                  className={cx(
                    'block h-3 w-3 rounded-full bg-[rgba(152,140,131,0.32)]',
                    (active || done) && 'bg-gradient-to-br from-[#d5ac8a] to-[#9ca7d8]'
                  )}
                />
                <p className="m-0 text-sm text-[#6b5f59]">{step}</p>
              </div>
            );
          })}
        </div>
        {error ? <div className="mt-2 text-sm text-[#b36f67]">{error}</div> : null}
        <button type="button" className={`${secondaryButtonClass} mt-3`} onClick={() => navigate('/queue')}>
          查看任务队列
        </button>
      </PageSection>
    </div>
  );
}
