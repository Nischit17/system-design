import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({ icon: Icon, title, description, action, className = "" }: { icon: LucideIcon; title?: string; description: string; action?: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-surface/60 px-6 py-12 text-center ${className}`}>
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-active text-text-muted">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      {title && <h3 className="text-sm font-semibold text-text-primary">{title}</h3>}
      <p className="max-w-sm text-sm text-text-muted">{description}</p>
      {action}
    </div>
  );
}
