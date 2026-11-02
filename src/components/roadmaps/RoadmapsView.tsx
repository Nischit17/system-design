"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useMemo, useState } from "react";
import { ArrowRight, Bot, BrainCircuit, Check, Clock, CodeXml, ListChecks, Pencil, Trash2, type LucideIcon } from "lucide-react";
import type { CodeInfo } from "@/lib/content/roadmap-data";
import { FAMILIES, TONE_CLASSES, type FamilyId, type Track } from "@/lib/content/tracks";
import { DIFFICULTY_TONE } from "@/lib/content/summaries";
import { useTrackProgress } from "@/lib/store/track-progress";
import { useUserData } from "@/lib/store/user-data";
import { EmptyState } from "@/components/ui/EmptyState";
import { NamedIcon } from "@/components/ui/NamedIcon";
import { badge, ui, type BadgeTone } from "@/components/ui/styles";

const DIFFICULTY_BADGE: Record<CodeInfo["difficulty"], BadgeTone> = { Easy: "success", Medium: "warning", Hard: "danger" };

const FAMILY_ICONS: Record<FamilyId, LucideIcon> = {
  "software-system-design": CodeXml,
  "ml-ai-system-design": BrainCircuit,
  "llm-genai-systems": Bot,
};

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

function TrackBlock({
  track,
  number,
  label,
  progress,
}: {
  track: Track;
  number?: number;
  label?: string;
  progress: ReturnType<typeof useTrackProgress>;
}) {
  const total = track.sections.reduce((n, s) => n + s.codes.length, 0);
  const solved = progress.solvedIn(track.sections);
  const pct = Math.round((solved / Math.max(1, total)) * 100);
  return (
    <div className={`${ui.card} relative overflow-hidden p-5 sm:p-6`}>
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-accent to-transparent" />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {number !== undefined && (
          <span className="figures flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-strong text-xs font-bold text-on-accent shadow-[0_6px_18px_-8px_var(--accent-glow)]" aria-hidden="true">
            {number}
          </span>
        )}
        <Link href={`/tracks/${track.slug}`} className="text-lg font-bold text-text-primary transition-colors duration-fast hover:text-accent">
          {label ?? track.shortTitle}
        </Link>
        <span className={`${badge(solved === total && total > 0 ? "success" : "neutral")} figures`}>
          {solved}/{total} solved
        </span>
        <Link href={`/tracks/${track.slug}`} className={`${ui.btnGhost} ${ui.btnSm} ml-auto`}>
          Open track
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-surface-active">
        <div className="h-full rounded-full bg-gradient-to-r from-accent to-mint transition-[width] duration-slow ease-spring-interactive" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {track.sections.map((s) => {
          const done = s.codes.filter(progress.isSolved).length;
          const tone = TONE_CLASSES[s.tone];
          return (
            <Link
              key={s.id}
              href={`/tracks/${track.slug}#${s.id}`}
              className="group flex flex-col gap-2.5 rounded-xl border border-border bg-background-elevated/60 p-4 transition-all duration-normal ease-spring-interactive hover:-translate-y-0.5 hover:border-border-strong hover:bg-surface-hover"
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone.chip}`} aria-hidden="true">
                <NamedIcon name={s.icon} className={`h-4 w-4 ${tone.icon}`} />
              </span>
              <h4 className="text-sm font-semibold leading-snug text-text-primary">{s.title}</h4>
              <p className="figures mt-auto text-xs text-text-muted">
                {done} of {s.codes.length} solved
              </p>
              <div className="h-1 w-full overflow-hidden rounded-full bg-surface-active">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-accent to-mint transition-[width] duration-slow ease-spring-interactive"
                  style={{ width: `${(done / Math.max(1, s.codes.length)) * 100}%` }}
                />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function FamilyHeading({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-7 w-1 shrink-0 rounded-full bg-gradient-to-b from-accent to-mint" aria-hidden="true" />
      <h2 className="text-2xl font-bold text-text-primary">{title}</h2>
      <span className="h-px flex-1 bg-gradient-to-r from-border-strong to-transparent" aria-hidden="true" />
    </div>
  );
}

function TierGroup({ label, tracks, progress }: { label: string; tracks: Track[]; progress: ReturnType<typeof useTrackProgress> }) {
  return (
    <div>
      <p className={ui.label}>{label}</p>
      <div className="mt-3">
        {tracks.map((t, i) => (
          <Fragment key={t.slug}>
            <div>
              <TrackBlock track={t} number={i + 1} progress={progress} />
              {i < tracks.length - 1 && <Connector />}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function MyLists({ codes, titles }: { codes: Record<string, CodeInfo>; titles: Record<string, { title: string; difficulty: CodeInfo["difficulty"]; minutes: number }> }) {
  const { loaded, data, renameList, deleteList, statusOf } = useUserData();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  void codes;
  if (loaded && data.lists.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title="No lists yet"
        description="Use the + button next to any problem on the Problems page to create a list. Lists are saved in this browser."
        action={
          <Link href="/problems" className={`${ui.btnPrimary} ${ui.btnSm}`}>
            Browse problems
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        }
      />
    );
  }
  return (
    <div className="space-y-5">
      {data.lists.map((l) => (
        <section key={l.id} className={`${ui.card} p-5`}>
          <div className="flex items-center justify-between gap-3">
            {editing === l.id ? (
              <input
                autoFocus
                value={draft}
                maxLength={60}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                  renameList(l.id, draft);
                  setEditing(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    renameList(l.id, draft);
                    setEditing(null);
                  }
                  if (e.key === "Escape") setEditing(null);
                }}
                className={`${ui.input} !py-1.5 text-base font-semibold`}
              />
            ) : (
              <h3 className="flex items-center gap-2 text-base font-semibold text-text-primary">
                {l.name}
                <span className={`${badge("neutral")} figures`}>{l.problemIds.length}</span>
              </h3>
            )}
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Rename list"
                onClick={() => {
                  setDraft(l.name);
                  setEditing(l.id);
                }}
                className={`${ui.iconBtn} !h-8 !w-8`}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Delete list"
                onClick={() => deleteList(l.id)}
                className={`${ui.iconBtn} !h-8 !w-8 hover:!border-danger/40 hover:!text-danger`}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
          {l.problemIds.length === 0 ? (
            <p className="mt-3 text-sm text-text-muted">This list is empty. Add problems from the Problems page.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border">
              {l.problemIds.map((id) => {
                const t = titles[id];
                if (!t) return null;
                const tone = DIFFICULTY_TONE[t.difficulty];
                const done = statusOf(id) === "completed";
                return (
                  <li key={id}>
                    <Link href={`/problems/${id}?from=problems`} className="flex items-center justify-between gap-3 bg-background-elevated/40 px-4 py-3 transition-colors duration-fast hover:bg-surface-hover">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-text-primary">{t.title}</span>
                        <span className="figures text-[11px] font-semibold text-accent">{id.split("-")[0].toUpperCase()}</span>
                      </span>
                      <span className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                        {done && (
                          <span className={badge("success")}>
                            <Check className="h-3 w-3" aria-hidden="true" />
                            Completed
                          </span>
                        )}
                        <span className={badge(DIFFICULTY_BADGE[t.difficulty])}>
                          <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden="true" />
                          {t.difficulty}
                        </span>
                        <span className="figures hidden items-center gap-1 text-xs text-text-muted sm:inline-flex">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          {t.minutes} min
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

export function RoadmapsView({
  tracks,
  codes,
  titles,
}: {
  tracks: Track[];
  codes: Record<string, CodeInfo>;
  titles: Record<string, { title: string; difficulty: CodeInfo["difficulty"]; minutes: number }>;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const initialFamily = (params.get("family") as FamilyId) || "software-system-design";
  const [family, setFamily] = useState<FamilyId>(FAMILIES.some((f) => f.id === initialFamily) ? initialFamily : "software-system-design");
  const [view, setView] = useState<"roadmap" | "lists">(params.get("view") === "lists" ? "lists" : "roadmap");
  const progress = useTrackProgress(codes);

  const familyTracks = useMemo(() => tracks.filter((t) => t.family === family).sort((a, b) => a.order - b.order), [tracks, family]);
  const select = (f: FamilyId) => {
    setFamily(f);
    setView("roadmap");
    router.replace(f === "software-system-design" ? "/roadmaps" : `/roadmaps?family=${f}`, { scroll: false });
  };

  const fam = FAMILIES.find((f) => f.id === family)!;
  const foundations = familyTracks.filter((t) => t.tier === "Foundations");
  const advanced = familyTracks.filter((t) => t.tier === "Advanced");
  const standalone = familyTracks.filter((t) => t.tier === null);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        <div role="tablist" aria-label="Curriculum" className={ui.segment}>
          {FAMILIES.map((f) => {
            const Icon = FAMILY_ICONS[f.id];
            const on = view === "roadmap" && f.id === family;
            return (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => select(f.id)}
                className={`${ui.segmentItem(on)} !px-3 !py-2 !text-sm sm:!px-4`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {f.tabLabel}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => {
            setView("lists");
            router.replace("/roadmaps?view=lists", { scroll: false });
          }}
          aria-pressed={view === "lists"}
          className={`${ui.btnSecondary} ${view === "lists" ? "!border-accent/50 !bg-accent/15" : ""}`}
        >
          <ListChecks className="h-4 w-4" aria-hidden="true" />
          My lists
        </button>
      </div>

      <div className="mt-8 space-y-12">
        {view === "lists" ? (
          <MyLists codes={codes} titles={titles} />
        ) : (
          <section key={family} className="stagger-in">
            <FamilyHeading title={fam.title} />
            <div className="mt-5 space-y-8">
              {foundations.length > 0 && <TierGroup label="Foundations" tracks={foundations} progress={progress} />}
              {advanced.length > 0 && <TierGroup label="Advanced" tracks={advanced} progress={progress} />}
              {standalone.length > 0 && (
                <div className="mt-8 space-y-8">
                  {standalone.map((t) => (
                    <TrackBlock key={t.slug} track={t} label={t.slug === "expert-system-architecture" ? "Expert" : t.shortTitle} progress={progress} />
                  ))}
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
