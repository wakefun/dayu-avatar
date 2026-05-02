import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const message = searchParams.get('error');
    if (message) {
      setError(message);
    }
  }, [searchParams]);

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
          onClick={() => {
            setLoading(true);
            setError(null);
            api.startLogin();
          }}
        >
          {loading ? '登录中...' : '使用大宇统一登录'}
        </button>
      </div>
    </div>
  );
}
