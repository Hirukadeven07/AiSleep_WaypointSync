import type { ReactNode } from 'react';

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-sm rounded-card border border-dashed border-border p-xl text-center">
      <p className="text-title font-semibold">{title}</p>
      {description && <p className="text-label text-muted">{description}</p>}
      {action}
    </div>
  );
}
