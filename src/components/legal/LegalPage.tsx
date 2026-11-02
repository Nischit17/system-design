import { PageFrame } from "@/components/site/PageFrame";
import { PageHeading } from "@/components/site/PageHeading";
import { ui } from "@/components/ui/styles";

export interface LegalSection {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  after?: string[];
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export function LegalPage({ title, updated, summary, sections }: { title: string; updated: string; summary: string; sections: LegalSection[] }) {
  return (
    <PageFrame>
      <div className="relative mx-auto max-w-6xl px-5 pb-20 sm:px-10">
        <PageHeading eyebrow={`Last updated ${updated}`} title={title} subtitle={summary} />
        <div className="lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start lg:gap-10">
          <nav aria-label="On this page" className="mb-8 hidden lg:sticky lg:top-24 lg:block">
            <p className={`${ui.label} mb-3`}>On this page</p>
            <ol className="space-y-0.5 border-l border-border">
              {sections.map((s, i) => (
                <li key={s.title}>
                  <a
                    href={`#${slug(s.title)}`}
                    className="-ml-px flex gap-2.5 border-l border-transparent py-1.5 pl-4 text-[13px] text-text-muted transition-colors duration-fast hover:border-accent hover:text-text-primary"
                  >
                    <span className="figures text-text-muted/70">{String(i + 1).padStart(2, "0")}</span>
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <div className="space-y-3">
            {sections.map((s, i) => (
              <section key={s.title} id={slug(s.title)} className={`${ui.card} scroll-mt-24 p-5 sm:p-6`}>
                <h2 className="flex items-baseline gap-3 text-lg font-semibold text-text-primary">
                  <span className="figures text-sm font-semibold text-accent">{String(i + 1).padStart(2, "0")}</span>
                  {s.title}
                </h2>
                <div className="mt-3 space-y-3 text-[15px] leading-7 text-text-secondary">
                  {s.paragraphs?.map((p) => (
                    <p key={p}>{p}</p>
                  ))}
                  {s.bullets && (
                    <ul className="space-y-1.5">
                      {s.bullets.map((b) => (
                        <li key={b} className="flex gap-2.5">
                          <span className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {s.after?.map((p) => (
                    <p key={p}>{p}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </PageFrame>
  );
}
