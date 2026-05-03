import type { ReactNode } from 'react';

type PageSectionProps = {
  title?: string;
  subtitle?: string;
  children: ReactNode;
};

export function PageSection({ title, subtitle, children }: PageSectionProps) {
  return (
    <section className="section glass-card">
      {title || subtitle ? (
        <div className="section-head">
          <div>
            {title ? <h2>{title}</h2> : null}
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
        </div>
      ) : null}
      {children}
    </section>
  );
}
