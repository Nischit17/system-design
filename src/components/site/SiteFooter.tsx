import Link from "next/link";
import { FOOTER_LINKS, PRIMARY_NAV, SITE } from "@/lib/site";
import { LogoLockup } from "./Logo";

const COLUMNS = [
  { title: "Practice", links: PRIMARY_NAV.filter((l) => l.href !== "/about") },
  { title: "Company", links: FOOTER_LINKS.filter((l) => l.href === "/about" || l.href === "/contact") },
  { title: "Legal", links: FOOTER_LINKS.filter((l) => l.href === "/terms" || l.href === "/privacy") },
];

export function SiteFooter() {
  return (
    <footer className="relative mt-24 border-t border-border bg-background/60">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div className="max-w-xs">
          <LogoLockup />
          <p className="mt-4 text-sm leading-relaxed text-text-muted">{SITE.tagline}. System design practice on a canvas that a simulator load-tests for real.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-text-secondary">
              <span className="status-dot" aria-hidden="true" />
              All systems nominal
            </span>
            <span className="inline-flex items-center rounded-full border border-border px-3 py-1.5 text-xs font-medium text-text-secondary">Free and open source</span>
          </div>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h2 className="eyebrow text-text-muted">{col.title}</h2>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-text-secondary transition-colors duration-fast hover:text-text-primary">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-6 text-xs text-text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {SITE.copyrightYear} {SITE.name}. Free for everyone, no account needed.
          </p>
          <p>Built for engineers who like their answers in numbers.</p>
        </div>
      </div>
    </footer>
  );
}
