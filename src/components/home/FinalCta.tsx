import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/motion/Reveal";

export function FinalCta() {
  return (
    <section className="mx-auto max-w-7xl px-6 pb-4 pt-12">
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl border border-border bg-surface px-8 py-16 sm:px-16 sm:py-20">
          <div aria-hidden="true" className="app-grid-background absolute inset-0 opacity-90" />
          <svg
            aria-hidden="true"
            viewBox="0 0 520 520"
            className="absolute -right-40 top-1/2 h-[560px] w-[560px] -translate-y-1/2 opacity-70 motion-safe:animate-[orbit-spin_70s_linear_infinite] sm:-right-24"
          >
            <circle cx="260" cy="260" r="250" fill="none" stroke="#9b82ff40" strokeDasharray="2 9" />
            <circle cx="260" cy="260" r="180" fill="none" stroke="#9b82ff2e" />
            <circle cx="260" cy="260" r="110" fill="none" stroke="#3cffc22e" strokeDasharray="4 7" />
            <circle cx="260" cy="10" r="5" fill="#3cffc2" />
            <circle cx="440" cy="260" r="4" fill="#9b82ff" />
            <circle cx="182" cy="356" r="3.5" fill="#3cffc2" />
          </svg>
          <div className="relative max-w-2xl">
            <p className="figures text-xs uppercase tracking-[0.12em] text-accent">Ready when you are</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.035em] text-text-primary sm:text-5xl">Your first load test is one design away.</h2>
            <p className="mt-5 text-lg leading-relaxed text-text-secondary">Pick a problem, sketch the system, and find out exactly what it can carry.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/problems"
                className="btn-press group inline-flex items-center justify-center gap-2 rounded-xl bg-accent-strong px-6 py-3.5 text-sm font-semibold text-on-accent shadow-[0_14px_44px_-12px_var(--accent-glow)] transition-all duration-normal ease-spring-interactive hover:-translate-y-0.5 hover:brightness-110"
              >
                Start designing
                <ArrowRight className="h-4 w-4 transition-transform duration-normal group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
              <Link
                href="/learning"
                className="glass-panel btn-press inline-flex items-center justify-center rounded-xl px-6 py-3.5 text-sm font-semibold text-text-primary transition-all duration-normal ease-spring-interactive hover:-translate-y-0.5 hover:border-border-strong"
              >
                Read the guides
              </Link>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
