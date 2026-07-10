import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  body?: string;
  children?: ReactNode;
}

export default function EmptyState({ title, body, children }: EmptyStateProps) {
  return (
    <div className="empty-state" role="status">
      <h2 className="empty-state-title">{title}</h2>
      {body ? <p className="empty-state-body">{body}</p> : null}
      {children}
    </div>
  );
}
