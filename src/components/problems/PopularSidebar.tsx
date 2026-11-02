import Link from "next/link";
import { Award, ChevronRight, Flame, Medal, type LucideIcon } from "lucide-react";
import { popularQuestions } from "@/lib/content/registry";
import { DIFFICULTY_TONE } from "@/lib/content/summaries";
import type { Problem } from "@/lib/content/types";

const TIERS: { key: "gold" | "silver" | "bronze"; title: string; subtitle: string; icon: LucideIcon; tone: string }[] = [
  { key: "gold", title: "Popular Questions", subtitle: "Most commonly asked", icon: Flame, tone: "#9b82ff" },
  { key: "silver", title: "Popular Questions: Silver", subtitle: "Commonly asked", icon: Medal, tone: "#c3c9d9" },
  { key: "bronze", title: "Popular Questions: Bronze", subtitle: "Asked", icon: Award, tone: "#ffb547" },
];

function QuestionLink({ p }: { p: Problem }) {
  return (
    <li>
      <Link
        href={`/problems/${p.id}`}
        className="group flex items-center justify-between gap-3 rounded-xl border border-transparent px-3 py-2.5 transition-colors duration-fast hover:border-border hover:bg-surface-hover"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-text-primary">Design {p.title}</span>
          <span className="mt-1 flex items-center gap-1.5 figures text-[10px] uppercase tracking-[0.12em]">
            <span className={DIFFICULTY_TONE[p.difficulty].text}>{p.difficulty}</span>
            <span className="text-text-muted">·</span>
            <span className="text-text-muted">{p.estimatedMinutes} min</span>
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-text-muted transition-transform duration-fast group-hover:translate-x-0.5 group-hover:text-text-primary" aria-hidden="true" />
      </Link>
    </li>
  );
}

export function PopularSidebar() {
  const q = popularQuestions();
  if (!q.gold.length && !q.silver.length && !q.bronze.length) return null;
  return (
    <aside className="hidden shrink-0 lg:block lg:w-[340px]">
      <div className="sticky top-24 space-y-5">
        {TIERS.map((t) =>
          q[t.key].length ? (
            <div key={t.key} className="relative overflow-hidden rounded-2xl border border-border bg-surface/80 p-4 backdrop-blur-sm">
              <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${t.tone}, transparent)` }} />
              <div className="flex items-center gap-2.5 px-1">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border" style={{ borderColor: `${t.tone}55`, background: `${t.tone}1a` }}>
                  <t.icon className="h-4 w-4" style={{ color: t.tone }} aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-text-primary">{t.title}</h2>
                  <p className="text-xs text-text-muted">{t.subtitle}</p>
                </div>
              </div>
              <ul className="mt-3 space-y-0.5">
                {q[t.key].map((p) => (
                  <QuestionLink key={p.id} p={p} />
                ))}
              </ul>
            </div>
          ) : null,
        )}
      </div>
    </aside>
  );
}
