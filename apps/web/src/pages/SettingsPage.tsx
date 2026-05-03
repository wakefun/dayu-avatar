import { useNavigate } from 'react-router-dom';
import { PageSection } from '../components/PageSection';
import { api } from '../lib/api';
import type { SessionSummary, User } from '../lib/types';

type SettingsPageProps = {
  user: User;
  session: SessionSummary | null;
  onLogout: () => void;
};

export function SettingsPage({ user, session, onLogout }: SettingsPageProps) {
  const navigate = useNavigate();
  const authModeLabel = session?.authMode === 'oidc' ? '已连接大宇统一登录' : '当前会话由大宇统一登录接入';

  return (
    <div className="stack-page">
      <PageSection title="账户设置" subtitle="查看当前用户信息、登录状态与退出入口。">
        <div className="settings-card">
          <div className="avatar-mark large" style={user.avatarUrl ? { backgroundImage: `url(${user.avatarUrl})` } : undefined}>
            {user.avatarUrl ? null : user.displayName.slice(0, 1)}
          </div>
          <div>
            <strong>{user.displayName}</strong>
            <p>{user.email ?? '未提供邮箱'}</p>
            <small>{authModeLabel}</small>
          </div>
        </div>
        <div className="list-card app-info-card">
          <strong>应用信息</strong>
          <p>大宇头像会根据你的个人形象参考图和喜欢的风格，生成适合社交头像、个人主页和日常表达的精致头像作品。你可以保存喜欢的结果到图库，也可以随时设置为当前头像。</p>
        </div>
        <button
          type="button"
          className="logout-button"
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
