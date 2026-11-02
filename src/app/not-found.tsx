import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LogoMark } from "@/components/site/Logo";
import { ui } from "@/components/ui/styles";

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center p-6 text-center text-text-primary sm:p-10">
      <div aria-hidden="true" className="app-grid-background pointer-events-none fixed inset-0 -z-10" />
      <div className="stagger-in relative flex flex-col items-center gap-5">
        <LogoMark className="h-10 w-10" />
        <div>
          <p className="eyebrow inline-flex items-center gap-2 text-danger">
            <span className="status-dot" data-state="down" aria-hidden="true" />
            404 · Route not found
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-0.03em] sm:text-4xl">This page doesn&apos;t exist</h1>
          <p className="mx-auto mt-3 max-w-md text-text-secondary">The link might be broken, or the page may have moved. Let&apos;s get you back on track.</p>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <Link href="/" className={ui.btnPrimary}>
            Go home
          </Link>
          <Link href="/problems" className={ui.btnSecondary}>
            Browse problems
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </main>
  );
}
