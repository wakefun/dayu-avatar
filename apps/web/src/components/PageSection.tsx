import type { ReactNode } from 'react';
import { cx, glassPanelClass } from './ui';

type PageSectionProps = {
  title?: string;
  subtitle?: string;
  children: ReactNode;
};

export function PageSection({ title, subtitle, children }: PageSectionProps) {
  return (
    <section className={cx(glassPanelClass, 'px-5 py-5')}>
      {title || subtitle ? (
        <div className="mb-3 grid gap-1.5">
          {title ? <h2 className="font-serif text-[24px] font-semibold text-[#2f2724]">{title}</h2> : null}
          {subtitle ? <p className="m-0 text-sm leading-6 text-[#6b5f59]">{subtitle}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
