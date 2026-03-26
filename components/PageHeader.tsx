import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Standard module page title block (Phase C). Pages adopt this in Phase D — exported now for the system.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="min-w-0">
        <h1 className="ui-page-title">{title}</h1>
        {description ? <p className="ui-page-description mt-1 max-w-2xl">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
