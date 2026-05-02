import { useNavigate } from 'react-router-dom';
import { PageSection } from '../components/PageSection';
import { api } from '../lib/api';
import type { User } from '../lib/types';

type SettingsPageProps = {
  user: User;
  onLogout: () => void;
};

export function SettingsPage({ user, onLogout }: SettingsPageProps) {
  const navigate = useNavigate();

  return (
    <div className="stack-page">
      <PageSection title="账户设置" subtitle="展示当前用户、登录方式状态与退出入口。">
        <div className="settings-card">
          <div className="avatar-mark large">{user.displayName.slice(0, 1)}</div>
          <div>
            <strong>{user.displayName}</strong>
            <p>{user.email ?? 'mock 账号'}</p>
            <small>登录方式：大宇统一登录（mock）</small>
          </div>
        </div>
        <div className="list-card">
          <strong>应用信息</strong>
          <p>Dayu Avatar MVP · React + Express + SQLite</p>
        </div>
        <button
          type="button"
          className="secondary-button danger"
          onClick={async () => {
            await api.logout();
            onLogout();
            navigate('/login');
          }}
        >
          退出登录
        </button>
      </PageSection>
    </div>
  );
}
