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
    <div className="grid min-h-[100svh] place-items-center overflow-x-hidden px-4 pt-[max(24px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]">
      <div className={cx(glassPanelClass, 'grid w-full max-w-[358px] gap-[18px] p-6')}>
        <div className="text-center text-[13px] tracking-[0.02em] text-[#8a7c74]">Dayu Images</div>
        <h1 className="m-0 text-center font-serif text-[34px] font-semibold text-[#2f2724]">大宇图片</h1>
        <p className="m-0 text-center text-[15px] leading-7 text-[#6b5f59]">
          上传原图与参考图，复刻风格、场景和画风，生成更贴近想象的图片作品。
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
