import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { User } from '../lib/types';

type LoginPageProps = {
  onLogin: (user: User) => void;
};

export function LoginPage({ onLogin }: LoginPageProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="login-page">
      <div className="login-card glass-card">
        <div className="eyebrow">Athereal Gallery</div>
        <h1>大宇头像</h1>
        <p>
          上传你的灵感与人物参考，在轻透画廊风格里生成更有故事感的个人头像。
        </p>
        {error ? <div className="error-text">{error}</div> : null}
        <button
          type="button"
          className="primary-button"
          disabled={loading}
          onClick={async () => {
            try {
              setLoading(true);
              setError(null);
              const response = await api.mockLogin('大宇体验用户');
              onLogin(response.user);
              navigate('/');
            } catch (requestError) {
              setError(requestError instanceof Error ? requestError.message : '登录失败');
            } finally {
              setLoading(false);
            }
          }}
        >
          {loading ? '登录中...' : '使用大宇统一登录'}
        </button>
      </div>
    </div>
  );
}
