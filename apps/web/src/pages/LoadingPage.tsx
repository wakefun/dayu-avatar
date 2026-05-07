import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageSection } from '../components/PageSection';
import { api } from '../lib/api';
import type { TaskStreamPayload } from '../lib/types';
import { cx, pageStackClass, primaryButtonClass, secondaryButtonClass } from '../components/ui';

const steps = ['理解创作需求', '规划生图提示词', '生成暗房作品', '高清细化中'];

export function LoadingPage() {
  const { taskId = '' } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState<TaskStreamPayload['task'] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const eventSource = api.streamTask(taskId);
    let terminal = false;

    eventSource.addEventListener('task', (event) => {
      const { task: nextTask } = JSON.parse(event.data) as TaskStreamPayload;
      setTask(nextTask);
      setError(null);

      if (nextTask.status === 'completed') {
        terminal = true;
        eventSource.close();
        navigate(`/generate/result/${taskId}`);
      }

      if (nextTask.status === 'failed' || nextTask.status === 'canceled') {
        terminal = true;
        eventSource.close();
      }
    });

    eventSource.addEventListener('error', () => {
      if (!terminal) {
        void api
          .getTask(taskId)
          .then((response) => {
            setTask(response.task);
            setError(null);
          })
          .catch((requestError: unknown) => {
            setError(requestError instanceof Error ? requestError.message : '获取任务失败');
          });
      }
      eventSource.close();
    });

    return () => eventSource.close();
  }, [navigate, taskId]);

  const isTerminalFailure = task?.status === 'failed' || task?.status === 'canceled';
  const failedTaskId = task?.status === 'failed' ? task.id : null;
  const terminalTitle = task?.status === 'failed' ? '生成失败' : '任务已取消';
  const terminalMessage = task?.status === 'failed' ? task.error?.message ?? '生成过程中遇到问题，请稍后重试。' : '这个任务已经取消，不会继续生成。';

  return (
    <div className={pageStackClass}>
      {isTerminalFailure ? (
        <PageSection title={terminalTitle} subtitle="这个任务已经结束，不会继续显示生成进度。">
          <div className="grid gap-3 text-center">
            <div className="mx-auto grid h-[92px] w-[92px] place-items-center rounded-full bg-[rgba(179,111,103,0.14)] text-[34px] font-semibold text-[#a66b65]">
              !
            </div>
            <strong className="text-[15px] text-[#2f2724]">{terminalTitle}</strong>
            <p className="m-0 text-sm leading-6 text-[#6b5f59]">{terminalMessage}</p>
            <div className="mt-1 grid gap-2.5">
              {failedTaskId ? (
                <button
                  type="button"
                  className={primaryButtonClass}
                  onClick={async () => {
                    try {
                      setError(null);
                      const response = await api.retryTask(failedTaskId);
                      navigate(`/generate/loading/${response.task.id}`);
                    } catch (requestError) {
                      setError(requestError instanceof Error ? requestError.message : '重试任务失败');
                    }
                  }}
                >
                  重试任务
                </button>
              ) : null}
              {error ? <div className="text-sm text-[#b36f67]">{error}</div> : null}
              <button type="button" className={secondaryButtonClass} onClick={() => navigate('/records')}>
                返回我的记录
              </button>
            </div>
          </div>
        </PageSection>
      ) : (
        <>
          <PageSection title="正在生成作品" subtitle="当前任务仍在处理中，你可以稍后前往我的记录查看最新进度。">
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
            <button type="button" className={`${secondaryButtonClass} mt-3`} onClick={() => navigate('/records')}>
              查看我的记录
            </button>
          </PageSection>
        </>
      )}
    </div>
  );
}
