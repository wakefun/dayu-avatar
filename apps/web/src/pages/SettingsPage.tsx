import { useNavigate } from 'react-router-dom';
import { PageSection } from '../components/PageSection';
import { api } from '../lib/api';
import type { SessionSummary, User } from '../lib/types';
import { cx, pageStackClass, softCardClass } from '../components/ui';

type SettingsPageProps = {
  user: User;
  session: SessionSummary | null;
  onLogout: () => void;
};

const avatarClass =
  'grid place-items-center rounded-full bg-gradient-to-br from-[#f3e8e1] to-[#dde6fa] bg-cover bg-center font-bold text-[#433632]';

export function SettingsPage({ user, session, onLogout }: SettingsPageProps) {
  const navigate = useNavigate();
  const authModeLabel = session?.authMode === 'oidc' ? '已连接大宇统一登录' : session?.authMode === 'mock' ? '模拟登录体验模式' : '未获取会话信息';

  return (
    <div className={pageStackClass}>
      <PageSection title="账户设置" subtitle="查看当前用户信息、登录状态与退出入口。">
        <div className="flex items-center gap-3 px-0 pt-2 pb-4">
          <div
            className={cx(avatarClass, 'h-16 w-16 text-xl')}
            style={user.avatarUrl ? { backgroundImage: `url(${user.avatarUrl})` } : undefined}
          >
            {user.avatarUrl ? null : user.displayName.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <strong className="block truncate text-[15px] text-[#2f2724]">{user.displayName}</strong>
            <p className="mt-1 truncate text-sm text-[#6b5f59]">{user.email ?? '未提供邮箱'}</p>
            <small className="mt-1 block text-sm text-[#6b5f59]">{authModeLabel}</small>
          </div>
        </div>
        <div className={softCardClass}>
          <strong className="text-[15px] text-[#2f2724]">应用信息</strong>
          <p className="mt-2 text-sm leading-7 text-[#6b5f59]">大宇暗房会根据你的原图、参考图和自定义需求，生成贴近目标风格、场景与画风的图片作品。你可以保存喜欢的结果到图库，也可以把作品设置为当前头像。</p>
        </div>
        <button
          type="button"
          className="mt-4 inline-flex min-h-[58px] w-full items-center justify-center rounded-[22px] bg-gradient-to-br from-[#d98479] to-[#b35f64] px-5 py-3 text-sm font-bold text-white shadow-[0_16px_32px_rgba(179,95,100,0.24)] transition hover:brightness-[1.03] active:scale-[0.99]"
          onClick={async () => {
            const response = await api.logout();
            onLogout();
            if (response.postLogoutRedirectUrl) {
              window.location.assign(response.postLogoutRedirectUrl);
              return;
            }
            navigate('/login');
          }}
        >
          退出登录
        </button>
      </PageSection>
    </div>
  );
}
