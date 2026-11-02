"use client";

import Link from "next/link";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, BookOpen, Hammer, Lightbulb, Wrench } from "lucide-react";
import type { Block, Guide, Tone } from "@/lib/content/learning/types";
import type { CodeInfo } from "@/lib/content/roadmap-data";
import { DIFFICULTY_TONE } from "@/lib/content/summaries";
import { badge, ui, type BadgeTone } from "@/components/ui/styles";
import { GuideThemeFab, GuideThemeToggle, useGuideTheme } from "./GuideTheme";
import { GuideWidget } from "./Widgets";

const DIFFICULTY_BADGE: Record<CodeInfo["difficulty"], BadgeTone> = { Easy: "success", Medium: "warning", Hard: "danger" };

const TONES: Record<Tone, { box: string; text: string }> = {
  info: { box: "border-info/40 bg-info/10", text: "text-info" },
  success: { box: "border-success/40 bg-success/10", text: "text-success" },
  warning: { box: "border-warning/40 bg-warning/10", text: "text-warning" },
  danger: { box: "border-danger/40 bg-danger/10", text: "text-danger" },
  accent: { box: "border-accent/40 bg-accent-soft", text: "text-accent" },
  neutral: { box: "border-border bg-background-elevated", text: "text-text-primary" },
};

/** Inline `code` spans inside prose. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("`") && p.endsWith("`") ? (
          <code key={i} className="rounded-md border border-border bg-background-elevated px-1.5 py-0.5 text-[0.85em] text-text-primary">
            {p.slice(1, -1)}
          </code>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

function Figure({ n, caption, children, padded = false }: { n: number; caption?: string; children: ReactNode; padded?: boolean }) {
  return (
    <figure className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className={padded ? "p-6" : "p-5 sm:p-6"}>{children}</div>
      {caption && (
        <figcaption className="border-t border-border bg-background-elevated px-5 py-3 text-xs leading-5 text-text-muted">
          <span className="font-semibold text-text-secondary">Figure {n}.</span> {caption}
        </figcaption>
      )}
    </figure>
  );
}

function BlockView({ block, figure }: { block: Block; figure: number }) {
  switch (block.type) {
    case "p":
      return (
        <p className="text-[16.5px] leading-[1.8] text-text-secondary">
          <Rich text={block.text} />
        </p>
      );
    case "h3":
      return <h3 className="pt-3 text-xl font-bold tracking-[-0.02em] text-text-primary">{block.text}</h3>;
    case "key":
      return (
        <div className="flex gap-3.5 rounded-2xl border border-accent/25 bg-accent-soft p-4 sm:p-5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Lightbulb className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <div className="eyebrow text-accent">{block.label ?? "Key idea"}</div>
            <p className="mt-1.5 text-[15px] leading-7 text-text-secondary">
              <Rich text={block.text} />
            </p>
          </div>
        </div>
      );
    case "warn":
      return (
        <div className="flex gap-3.5 rounded-2xl border border-warning/30 bg-warning/10 p-4 sm:p-5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <div className="eyebrow text-warning">{block.label ?? "Common mistake"}</div>
            <p className="mt-1.5 text-[15px] leading-7 text-text-secondary">
              <Rich text={block.text} />
            </p>
          </div>
        </div>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag className="space-y-2">
          {block.items.map((it, i) => (
            <li key={i} className="flex gap-3 text-[16.5px] leading-[1.8] text-text-secondary">
              {block.ordered ? (
                <span className="figures mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">{i + 1}</span>
              ) : (
                <span className="mt-[13px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
              )}
              <span>
                <Rich text={it} />
              </span>
            </li>
          ))}
        </Tag>
      );
    }
    case "terms":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {block.items.map(([term, def]) => (
            <div key={term} className="rounded-xl border border-border bg-surface p-4">
              <div className="text-sm font-bold text-accent">{term}</div>
              <p className="mt-1.5 text-sm leading-6 text-text-secondary">{def}</p>
            </div>
          ))}
        </div>
      );
    case "formula":
      return (
        <div className="rounded-2xl border border-border bg-background-elevated p-5">
          <div className="font-code space-y-2 text-sm text-text-primary">
            {block.lines.map((l) => (
              <div key={l}>{l}</div>
            ))}
          </div>
          {block.caption && <p className="mt-3 text-xs leading-5 text-text-muted">{block.caption}</p>}
        </div>
      );
    case "table":
      return (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-background-elevated text-left text-[10px] uppercase tracking-[0.12em] text-text-muted">
                {block.head.map((h) => (
                  <th key={h} className="px-3 py-2.5 font-bold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {block.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j} className={`px-3 py-2.5 ${j === 0 ? "font-semibold text-text-primary" : "text-text-secondary"}`}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {block.caption && <p className="border-t border-border bg-background-elevated px-3 py-2 text-xs text-text-muted">{block.caption}</p>}
        </div>
      );
    case "flow":
      return (
        <Figure n={figure} caption={block.caption}>
          <div className={block.vertical ? "mx-auto flex max-w-xs flex-col items-stretch gap-2" : "flex flex-wrap items-center justify-center gap-2"}>
            {block.steps.map((s, i) => {
              const t = TONES[s.tone ?? "neutral"];
              return (
                <Fragment key={`${s.label}-${i}`}>
                  {i > 0 &&
                    (block.vertical ? (
                      <ArrowDown className="h-4 w-4 self-center text-text-muted" aria-hidden="true" />
                    ) : (
                      <ArrowRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                    ))}
                  <div className={`rounded-xl border p-3 text-center ${t.box} ${block.vertical ? "" : "min-w-[120px]"}`}>
                    <div className={`text-[13px] font-bold ${t.text}`}>{s.label}</div>
                    {s.sub && <div className="mt-1 text-[11px] text-text-muted">{s.sub}</div>}
                  </div>
                </Fragment>
              );
            })}
          </div>
        </Figure>
      );
    case "compare":
      return (
        <Figure n={figure} caption={block.caption}>
          <div className={`grid gap-3 ${block.items.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            {block.items.map((it) => {
              const t = TONES[it.tone ?? "neutral"];
              return (
                <div key={it.title} className={`rounded-xl border p-4 ${t.box}`}>
                  <div className={`text-sm font-bold ${t.text}`}>{it.title}</div>
                  <ul className="mt-2 space-y-1.5">
                    {it.points.map((p) => (
                      <li key={p} className="flex gap-2 text-[13px] leading-5 text-text-secondary">
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-current opacity-60" aria-hidden="true" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </Figure>
      );
    case "bars":
      return (
        <Figure n={figure} caption={block.caption}>
          <div className="space-y-3">
            {block.items.map((b) => {
              const max = b.max ?? 100;
              const pct = Math.min(100, (b.value / max) * 100);
              const tone = b.tone ?? (b.value > max * 0.85 ? "danger" : "success");
              return (
                <div key={b.label}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-text-primary">{b.label}</span>
                    <span className={`figures font-semibold ${TONES[tone].text}`}>
                      {b.value.toLocaleString()}
                      {block.unit ?? "%"}
                      {b.note ? ` · ${b.note}` : ""}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-background-elevated">
                    <div className={`h-full rounded-full ${tone === "danger" ? "bg-danger" : tone === "warning" ? "bg-warning" : tone === "info" ? "bg-info" : "bg-success"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Figure>
      );
    case "widget":
      return (
        <figure>
          <GuideWidget name={block.name} />
          {block.caption && (
            <figcaption className="mt-2.5 text-xs leading-5 text-text-muted">
              <span className="font-semibold text-text-secondary">Figure {figure}.</span> {block.caption}
            </figcaption>
          )}
        </figure>
      );
  }
}

const isFigure = (b: Block) => b.type === "flow" || b.type === "compare" || b.type === "bars" || b.type === "widget";

export function GuideView({
  guide,
  sectionNumber,
  backHref,
  backLabel,
  labs,
}: {
  guide: Guide;
  sectionNumber: number;
  backHref: string;
  backLabel: string;
  labs: CodeInfo[];
}) {
  const chapters = [
    ...guide.chapters,
    {
      id: "practice",
      kicker: "Put it to work",
      title: "Practice labs",
      navTitle: "Practice Labs",
      summary: `${labs.length} hands-on design problems that build on every chapter above.`,
      intro: ["Each lab is graded by the simulator. Start from a blank canvas, or repair a running system that is already showing the symptom."],
      blocks: [],
    },
  ];
  const [active, setActive] = useState(chapters[0].id);
  const [progress, setProgress] = useState(0);
  const [theme, setTheme] = useGuideTheme();

  useEffect(() => {
    const els = chapters.map((c) => document.getElementById(c.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    els.forEach((el) => io.observe(el));
    const onScroll = () => {
      const article = document.getElementById("guide-article");
      if (!article) return;
      const r = article.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      setProgress(Math.max(0, Math.min(100, Math.round((-r.top / Math.max(1, total)) * 100))));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  let figure = 0;
  const diagramCount = guide.chapters.reduce((n, c) => n + c.blocks.filter(isFigure).length, 0);
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <main className="min-h-screen text-text-primary">
      <div aria-hidden="true" className="fixed inset-x-0 top-0 z-50 h-[2px] bg-transparent">
        <div className="h-full bg-gradient-to-r from-accent to-mint transition-[width] duration-150" style={{ width: `${progress}%` }} />
      </div>
      <section className="relative overflow-hidden border-b border-border">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 900px 480px at 0% 0%, color-mix(in srgb, var(--accent-strong) 14%, transparent), transparent 65%), radial-gradient(ellipse 700px 420px at 100% 100%, color-mix(in srgb, var(--mint) 8%, transparent), transparent 65%)",
          }}
        />
        <div className="relative mx-auto max-w-7xl px-5 pb-12 pt-6 sm:px-8 sm:pb-14">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href={backHref} className={`${ui.btnGhost} ${ui.btnSm} -ml-3`}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {backLabel}
            </Link>
            <GuideThemeToggle theme={theme} onChange={setTheme} />
          </div>
          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
            <div className="stagger-in">
              <p className="eyebrow inline-flex items-center gap-2 text-accent">
                <span className="h-px w-6 bg-gradient-to-r from-accent to-mint" aria-hidden="true" />
                {guide.kicker}
              </p>
              <h1 className="mt-4 max-w-4xl text-balance text-4xl font-bold leading-[1.02] tracking-[-0.035em] text-text-primary sm:text-6xl">{guide.title}</h1>
              <p className="mt-5 max-w-3xl text-pretty text-lg leading-8 text-text-secondary">{guide.intro}</p>
            </div>
            <div className={`${ui.card} p-5`}>
              <div className={ui.label}>By the end</div>
              <p className="mt-2 text-sm leading-6 text-text-secondary">{guide.byTheEnd}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                <span className={`${badge("accent")} figures`}>{chapters.length} chapters</span>
                <span className={`${badge("neutral")} figures`}>{diagramCount} diagrams</span>
                <span className={`${badge("success")} figures`}>{labs.length} labs</span>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="border-b border-border bg-background-elevated/60">
        <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
          <div className={ui.label}>What&apos;s in this guide</div>
          <ol className="mt-5 grid gap-3 sm:grid-cols-2">
            {chapters.map((c, i) => (
              <li key={c.id}>
                <a href={`#${c.id}`} className={`${ui.cardInteractive} group flex h-full gap-3.5 p-4`}>
                  <span className="figures mt-0.5 text-sm font-bold text-accent">{pad(i + 1)}</span>
                  <span>
                    <span className="font-semibold text-text-primary transition-colors duration-fast group-hover:text-accent">{c.navTitle}</span>
                    <span className="mt-0.5 block text-sm leading-6 text-text-secondary">{c.summary}</span>
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div data-lenis-prevent className="thin-scrollbar sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-2">
            <nav aria-label="Chapter navigation">
              <div className={`${ui.label} mb-3 flex items-center gap-2`}>
                <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                Section {pad(sectionNumber)}
              </div>
              <ol className="space-y-0.5 border-l border-border">
                {chapters.map((c, i) => {
                  const on = active === c.id;
                  return (
                    <li key={c.id}>
                      <a
                        href={`#${c.id}`}
                        aria-current={on ? "true" : undefined}
                        className={`-ml-px flex gap-2 border-l-2 py-1.5 pl-3.5 text-[13px] leading-5 transition-colors duration-fast ${
                          on ? "border-accent font-semibold text-text-primary" : "border-transparent text-text-muted hover:border-border-strong hover:text-text-primary"
                        }`}
                      >
                        <span className={`figures ${on ? "text-accent" : "text-text-muted/70"}`}>{pad(i + 1)}</span>
                        {c.navTitle}
                      </a>
                    </li>
                  );
                })}
              </ol>
            </nav>
            <div className={`${ui.card} mt-6 p-4`}>
              <div className="flex items-center justify-between">
                <span className={ui.statLabel}>Reading progress</span>
                <span className="figures text-xs font-semibold text-accent">{progress}%</span>
              </div>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-active" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Section reading progress">
                <div className="h-full rounded-full bg-gradient-to-r from-accent to-mint transition-[width] duration-150" style={{ width: `${progress}%` }} />
              </div>
              <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3.5">
                <span className={ui.statLabel}>Theme</span>
                <GuideThemeToggle theme={theme} onChange={setTheme} compact />
              </div>
            </div>
          </div>
        </aside>
        <article id="guide-article" className="min-w-0">
          {chapters.map((c, ci) => (
            <section key={c.id} id={c.id} className={`scroll-mt-24 ${ci === 0 ? "pb-14" : "border-t border-border py-14"}`}>
              <header className="grid gap-4 md:grid-cols-[72px_minmax(0,1fr)]">
                <div className="figures text-5xl font-bold leading-none tracking-[-0.04em] text-accent/30">{pad(ci + 1)}</div>
                <div>
                  <div className="eyebrow text-accent">{c.kicker}</div>
                  <h2 className="mt-2 text-3xl font-bold leading-tight tracking-[-0.03em] text-text-primary">{c.title}</h2>
                  <div className="mt-4 max-w-3xl space-y-3 text-[16.5px] leading-[1.8] text-text-secondary">
                    {c.intro.map((p) => (
                      <p key={p}>
                        <Rich text={p} />
                      </p>
                    ))}
                  </div>
                </div>
              </header>
              <div className="mt-8 max-w-4xl space-y-6">
                {c.blocks.map((b, bi) => {
                  if (isFigure(b)) figure += 1;
                  return <BlockView key={bi} block={b} figure={figure} />;
                })}
                {c.id === "practice" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {labs.map((l) => (
                      <div key={l.code} className={`${ui.card} flex flex-col p-5`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="figures text-xs font-semibold text-accent">{l.code}</span>
                          <span className={badge(DIFFICULTY_BADGE[l.difficulty])}>
                            <span className={`h-1.5 w-1.5 rounded-full ${DIFFICULTY_TONE[l.difficulty].dot}`} aria-hidden="true" />
                            {l.difficulty}
                          </span>
                        </div>
                        <h3 className="mt-2.5 text-base font-semibold text-text-primary">{l.title}</h3>
                        <p className="mt-1 text-xs text-text-muted">{l.concepts.slice(0, 2).join(" · ")}</p>
                        <div className="mt-auto flex flex-wrap gap-2 pt-4">
                          {l.scratchId && (
                            <Link href={`/problems/${l.scratchId}`} className={`${ui.btnPrimary} ${ui.btnSm} flex-1`}>
                              <Hammer className="h-3.5 w-3.5" aria-hidden="true" />
                              {l.fixId ? "Build from scratch" : "Open problem"}
                            </Link>
                          )}
                          {l.fixId && (
                            <Link
                              href={`/problems/${l.fixId}`}
                              className={`${ui.btnSm} btn-press inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-fix font-semibold text-white transition-all duration-normal hover:brightness-110`}
                            >
                              <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                              Fix existing design
                            </Link>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          ))}
          <div className={`${ui.card} mt-4 flex flex-wrap items-center justify-between gap-4 p-5`}>
            <div>
              <p className="text-sm font-semibold text-text-primary">Finished the reading?</p>
              <p className="text-sm text-text-muted">Head back to the track and try the labs for this section.</p>
            </div>
            <Link href={backHref} className={ui.btnSecondary}>
              Back to track
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </article>
      </div>
      <GuideThemeFab theme={theme} onChange={setTheme} />
    </main>
  );
}
