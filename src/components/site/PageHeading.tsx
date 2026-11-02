import type { ReactNode } from "react";

/**
 * Shared page header: eyebrow, title, one-line description and an optional slot on the right
 * (stats, actions). Every top-level page opens with this so headings line up across the site.
 */
export function PageHeading({
  eyebrow,
  title,
  subtitle,
  aside,
  className = "",
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`flex flex-col gap-5 pb-8 pt-6 sm:pt-10 lg:flex-row lg:items-end lg:justify-between ${className}`}>
      <div className="min-w-0 max-w-3xl">
        {eyebrow && (
          <p className="eyebrow inline-flex items-center gap-2 text-accent motion-safe:animate-[hero-sequence-reveal_0.5s_var(--ease-spring-interactive)_both]">
            <span className="h-px w-6 bg-gradient-to-r from-accent to-mint" aria-hidden="true" />
            {eyebrow}
          </p>
        )}
        <h1 className="mt-3 text-balance text-3xl font-bold leading-[1.08] tracking-[-0.03em] text-text-primary motion-safe:animate-[hero-sequence-reveal_0.6s_var(--ease-spring-interactive)_60ms_both] sm:text-[2.6rem]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-3 max-w-2xl text-pretty text-[15px] leading-7 text-text-secondary motion-safe:animate-[hero-sequence-reveal_0.6s_var(--ease-spring-interactive)_120ms_both] sm:text-base">
            {subtitle}
          </p>
        )}
      </div>
      {aside && <div className="shrink-0 motion-safe:animate-[hero-sequence-reveal_0.6s_var(--ease-spring-interactive)_180ms_both]">{aside}</div>}
    </header>
  );
}

/** Compact figure row for a PageHeading aside. */
export function HeadingStats({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="flex flex-wrap gap-2.5">
      {items.map((it) => (
        <div key={it.label} className="glass-panel min-w-[7.5rem] rounded-2xl px-4 py-3">
          <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">{it.label}</dt>
          <dd className="figures mt-1 text-xl font-bold text-text-primary">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
