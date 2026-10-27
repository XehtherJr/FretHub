import { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}

export default function EmptyState({ icon = '🎸', title, children, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="icon" aria-hidden="true">{icon}</span>
      <h3>{title}</h3>
      {children && <p className="muted">{children}</p>}
      {action && <div style={{ marginTop: '0.8rem' }}>{action}</div>}
    </div>
  );
}
