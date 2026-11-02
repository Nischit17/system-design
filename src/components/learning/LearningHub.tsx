"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useState } from "react";
import { ArrowUpRight, Bot, BrainCircuit, CodeXml, type LucideIcon } from "lucide-react";
import { FAMILIES, type FamilyId, type Track } from "@/lib/content/tracks";
import { NamedIcon } from "@/components/ui/NamedIcon";
import { badge, ui } from "@/components/ui/styles";

const FAMILY_ICONS: Record<FamilyId, LucideIcon> = {
  "software-system-design": CodeXml,
  "ml-ai-system-design": BrainCircuit,
  "llm-genai-systems": Bot,
};
const CHIP_TONES = ["text-accent bg-accent-soft", "text-info bg-info/10", "text-success bg-success/10", "text-warning bg-warning/10"];

function Connector() {
  return (
    <div className="flex justify-center py-1.5" aria-hidden="true">
      <svg width="20" height="30" viewBox="0 0 20 30" fill="none">
        <line x1="10" y1="0" x2="10" y2="20" stroke="var(--accent)" strokeWidth="2" strokeDasharray="4 4" className="roadmap-path-flow-vertical" />
        <path d="M4 18 L10 26 L16 18" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    </div>
  );
}

function TrackGuides({ track, number, stats, label }: { track: Track; number?: number; stats: Record<string, { chapters: number; labs: number }>; label?: string }) {
  return (
    <div className={`${ui.card} relative overflow-hidden p-5 sm:p-6`}>
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-accent to-transparent" />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {number !== undefined && (
          <span className="figures flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-strong text-xs font-bold text-on-accent shadow-[0_6px_18px_-8px_var(--accent-glow)]" aria-hidden="true">
            {number}
          </span>
        )}
        <span className="text-lg font-bold text-text-primary">{label ?? track.shortTitle}</span>
        <span className={`${badge("neutral")} figures`}>{track.sections.length} guides</span>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {track.sections.map((s, i) => (
          <Link
            key={s.id}
            href={`/tracks/${track.slug}/sections/${s.id}`}
            className="group flex flex-col gap-2.5 rounded-xl border border-border bg-background-elevated/60 p-4 transition-all duration-normal ease-spring-interactive hover:-translate-y-0.5 hover:border-border-strong hover:bg-surface-hover"
          >
            <span className="flex items-start justify-between">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${CHIP_TONES[i % CHIP_TONES.length]}`}>
                <NamedIcon name={s.icon} className="h-4 w-4" />
              </span>
              <ArrowUpRight className="h-4 w-4 text-text-muted opacity-0 transition-all duration-fast group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden="true" />
            </span>
            <h4 className="text-sm font-semibold leading-snug text-text-primary">{s.title}</h4>
            <p className="figures mt-auto text-xs text-text-muted">
              {stats[s.id]?.chapters ?? 0} chapters · {stats[s.id]?.labs ?? 0} labs
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function LearningHub({ tracks, stats }: { tracks: Track[]; stats: Record<string, { chapters: number; labs: number }> }) {
  const params = useSearchParams();
  const router = useRouter();
  const initial = (params.get("family") as FamilyId) || "software-system-design";
  const [family, setFamily] = useState<FamilyId>(FAMILIES.some((f) => f.id === initial) ? initial : "software-system-design");
  const fam = FAMILIES.find((f) => f.id === family)!;
  const list = tracks.filter((t) => t.family === family).sort((a, b) => a.order - b.order);
  const tiers = (["Foundations", "Advanced"] as const).map((tier) => ({ tier, tracks: list.filter((t) => t.tier === tier) })).filter((t) => t.tracks.length);
  const standalone = list.filter((t) => t.tier === null);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        <div role="tablist" aria-label="Curriculum" className={ui.segment}>
          {FAMILIES.map((f) => {
            const Icon = FAMILY_ICONS[f.id];
            const on = f.id === family;
            return (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => {
                  setFamily(f.id);
                  router.replace(f.id === "software-system-design" ? "/learning" : `/learning?family=${f.id}`, { scroll: false });
                }}
                className={`${ui.segmentItem(on)} !px-3 !py-2 !text-sm sm:!px-4`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {f.tabLabel}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-8 space-y-12">
        <section key={family} className="stagger-in">
          <div className="flex items-center gap-3">
            <span className="h-7 w-1 shrink-0 rounded-full bg-gradient-to-b from-accent to-mint" aria-hidden="true" />
            <h2 className="text-2xl font-bold text-text-primary">{fam.title}</h2>
            <span className="h-px flex-1 bg-gradient-to-r from-border-strong to-transparent" aria-hidden="true" />
          </div>
          <div className="mt-5 space-y-8">
            {tiers.map(({ tier, tracks: group }) => (
              <div key={tier}>
                <p className={ui.label}>{tier}</p>
                <div className="mt-3">
                  {group.map((t, i) => (
                    <Fragment key={t.slug}>
                      <TrackGuides track={t} number={i + 1} stats={stats} />
                      {i < group.length - 1 && <Connector />}
                    </Fragment>
                  ))}
                </div>
              </div>
            ))}
            {standalone.map((t) => (
              <TrackGuides key={t.slug} track={t} stats={stats} label={t.slug === "expert-system-architecture" ? "Expert" : t.shortTitle} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
