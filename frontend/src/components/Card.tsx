import type { ReactNode } from 'react';

interface Props {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  flush?: boolean;
  plainHeader?: boolean;
  className?: string;
}

export default function Card({ title, subtitle, actions, children, footer, flush, plainHeader, className = '' }: Props) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className={`card-header ${plainHeader ? 'plain' : ''}`}>
          <div style={{ minWidth: 0 }}>
            {title && <h2 className="card-title">{title}</h2>}
            {subtitle && <div className="card-subtitle">{subtitle}</div>}
          </div>
          {actions && <div className="row">{actions}</div>}
        </header>
      )}
      <div className={`card-body ${flush ? 'flush' : ''}`}>{children}</div>
      {footer && <footer className="card-footer">{footer}</footer>}
    </section>
  );
}
