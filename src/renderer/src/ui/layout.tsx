// Page structure shared by every tool.
import type { ReactNode } from 'react';

export function Page({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="page">
      <div className={`content ${wide ? 'wide' : ''}`}>{children}</div>
    </div>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </header>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section-header">
        <h2 className="section-title">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
