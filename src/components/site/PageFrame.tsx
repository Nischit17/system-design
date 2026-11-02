import type { ReactNode } from "react";
import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";

/** Standard page chrome: fixed glow background, sticky header, footer. */
export function PageFrame({
  children,
  className = "relative min-h-screen text-text-primary",
  headerGap = false,
  footer = true,
}: {
  children: ReactNode;
  className?: string;
  headerGap?: boolean;
  footer?: boolean;
}) {
  return (
    <main className={className}>
      <div aria-hidden="true" className="app-grid-background pointer-events-none fixed inset-0 -z-10" />
      <div className={headerGap ? "" : "[&>header]:mb-0"}>
        <SiteHeader />
      </div>
      {children}
      {footer && <SiteFooter />}
    </main>
  );
}
