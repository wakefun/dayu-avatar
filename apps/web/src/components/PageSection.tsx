import type { ReactNode } from 'react';

type PageSectionProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export function PageSection({ title, subtitle, children }: PageSectionProps) {
  return (
    <section className="section glass-card">
      <div className="section-head">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}
