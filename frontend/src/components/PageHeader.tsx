import type { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
}

export default function PageHeader({ title, subtitle, eyebrow, actions, breadcrumbs }: Props) {
  return (
    <div className="page-header">
      <div style={{ minWidth: 0 }}>
        {breadcrumbs && <div className="breadcrumbs">{breadcrumbs}</div>}
        {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <div className="page-subtitle">{subtitle}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}
