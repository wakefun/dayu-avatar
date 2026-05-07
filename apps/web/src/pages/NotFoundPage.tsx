import { useNavigate } from 'react-router-dom';
import { PageSection } from '../components/PageSection';
import { pageStackClass, secondaryButtonClass } from '../components/ui';

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className={pageStackClass}>
      <PageSection title="页面不存在" subtitle="这个入口已经不可用，请回到当前可用的功能页面。">
        <button type="button" className={secondaryButtonClass} onClick={() => navigate('/')}>
          返回大宇暗房
        </button>
      </PageSection>
    </div>
  );
}
