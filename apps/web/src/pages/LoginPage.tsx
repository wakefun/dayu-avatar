import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { cx, glassPanelClass, primaryButtonClass } from '../components/ui';

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
    <div className="grid min-h-screen place-items-center px-6">
      <div className={cx(glassPanelClass, 'grid w-full max-w-[430px] gap-[18px] p-7')}>
        <div className="text-center text-[13px] tracking-[0.02em] text-[#8a7c74]">Dayu Avatar</div>
        <h1 className="m-0 text-center font-serif text-[34px] font-semibold text-[#2f2724]">大宇头像</h1>
        <p className="m-0 text-center text-[15px] leading-7 text-[#6b5f59]">
          上传你的灵感与人物参考，在轻透画廊风格里生成更有故事感的个人头像。
        </p>
        {error ? <div className="text-sm text-[#b36f67]">{error}</div> : null}
        <button
          type="button"
          className={primaryButtonClass}
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
