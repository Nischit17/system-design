import Link from "next/link";
import { ArrowUpRight, Bot, BrainCircuit, CodeXml, type LucideIcon } from "lucide-react";
import { Reveal } from "@/components/motion/Reveal";
import { FAMILIES, tracksForFamily, type FamilyId, type Track } from "@/lib/content/tracks";

const ICONS: Record<FamilyId, LucideIcon> = { "software-system-design": CodeXml, "ml-ai-system-design": BrainCircuit, "llm-genai-systems": Bot };
const BLURBS: Record<FamilyId, string> = {
  "software-system-design": "Compute, storage, caching, events, resilience and operations, then full product designs graded against several scenarios.",
  "ml-ai-system-design": "The systems around the model: data and labels, feature stores, training clusters, evaluation gates and serving.",
  "llm-genai-systems": "Retrieval you can trust, GPU economics, quality gates and agents that take real actions safely.",
};
const problemCount = (t: Track) => t.sections.reduce((s, x) => s + x.codes.length, 0) * (t.dualMode ? 2 : 1);
const roadmapHref = (id: FamilyId) => (id === "software-system-design" ? "/roadmaps" : `/roadmaps?family=${id}`);

export function TrackShowcase() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24 sm:py-28">
      <Reveal className="max-w-3xl">
        <p className="figures text-xs uppercase tracking-[0.12em] text-accent">Roadmaps</p>
        <h2 className="mt-4 text-4xl font-semibold tracking-[-0.035em] text-text-primary sm:text-5xl">Pick a path. Every step is a real system.</h2>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-text-secondary">
          Tracks build from first principles to full product designs. Each section pairs a guide with hands-on labs, and most labs come in two modes: build it
          from scratch, or repair a system that is already failing.
        </p>
      </Reveal>
      <Reveal className="mt-14 grid gap-5 lg:grid-cols-3" stagger={0.12}>
        {FAMILIES.map((f) => {
          const Icon = ICONS[f.id];
          const tracks = tracksForFamily(f.id);
          const total = tracks.reduce((s, t) => s + problemCount(t), 0);
          return (
            <div
              key={f.id}
              className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface/70 p-6 transition-colors duration-normal hover:border-accent/40"
            >
              <span aria-hidden="true" className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-accent to-transparent opacity-50 transition-opacity duration-normal group-hover:opacity-100" />
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-accent/30 bg-accent/10">
                  <Icon className="h-5 w-5 text-accent" aria-hidden="true" />
                </span>
                <span className="figures text-xs text-text-muted">{total} problems</span>
              </div>
              <h3 className="mt-5 text-xl font-semibold tracking-[-0.02em] text-text-primary">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">{BLURBS[f.id]}</p>
              <ul className="mt-6 divide-y divide-border border-y border-border">
                {tracks.map((t) => (
                  <li key={t.slug}>
                    <Link href={`/tracks/${t.slug}`} className="group/row flex items-center justify-between gap-3 py-3 text-sm text-text-secondary transition-colors duration-fast hover:text-text-primary">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent/50 transition-colors duration-fast group-hover/row:bg-mint" />
                        <span className="truncate">{t.shortTitle}</span>
                      </span>
                      <span className="shrink-0 figures text-xs text-text-muted">{problemCount(t)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href={roadmapHref(f.id)} className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-semibold text-accent transition-colors duration-fast hover:text-text-primary">
                Open roadmap
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          );
        })}
      </Reveal>
    </section>
  );
}
