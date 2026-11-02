/**
 * Shared class recipes for Loadline's design system. Every page builds its controls,
 * cards and labels from these so spacing, radius, type and colour stay identical.
 */

const btnBase =
  "btn-press inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-normal ease-spring-interactive disabled:cursor-not-allowed disabled:opacity-50";

export const ui = {
  /** Small uppercase label above headings. */
  eyebrow: "eyebrow text-accent",
  /** Muted uppercase label for metadata and field captions. */
  label: "eyebrow text-text-muted",

  card: "rounded-2xl border border-border bg-surface/80",
  cardInteractive: "rounded-2xl border border-border bg-surface/80 transition-colors duration-normal hover:border-border-strong hover:bg-surface-hover",
  panel: "rounded-2xl border border-border bg-surface-raised",
  popover: "rounded-2xl border border-border bg-surface-raised p-2 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)]",
  inset: "rounded-xl border border-border bg-background-elevated",

  input:
    "w-full rounded-xl border border-border bg-background-elevated px-3.5 py-2.5 text-sm text-text-primary outline-none transition-colors duration-fast placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/25",

  btnPrimary: `${btnBase} bg-accent-strong px-5 py-2.5 text-sm text-on-accent shadow-[0_12px_32px_-14px_var(--accent-glow)] hover:brightness-110`,
  btnSecondary: `${btnBase} border border-border bg-surface px-5 py-2.5 text-sm text-text-primary hover:border-border-strong hover:bg-surface-hover`,
  btnGhost: `${btnBase} px-3 py-2 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary`,
  btnDanger: `${btnBase} border border-danger/40 bg-danger/10 px-5 py-2.5 text-sm text-danger hover:bg-danger/20`,
  btnSuccess: `${btnBase} bg-success px-5 py-2.5 text-sm text-[#04140e] hover:brightness-110`,
  /** Progression actions (next problem, track complete). */
  btnGold: `${btnBase} bg-roadmap-gold px-5 py-2.5 text-sm text-[#1b1204] shadow-[0_12px_32px_-14px_var(--roadmap-gold-glow)] hover:brightness-110`,
  /** Compact size modifier for any button recipe. */
  btnSm: "!px-3.5 !py-2 !text-xs",
  iconBtn:
    "btn-press inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border text-text-secondary transition-colors duration-fast hover:border-border-strong hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40",

  /** Segmented control container and its items. */
  segment: "inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-border bg-surface/80 p-1 [scrollbar-width:none]",
  segmentItem: (on: boolean) =>
    `inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-fast ${
      on ? "bg-accent-strong text-on-accent shadow-[0_6px_18px_-8px_var(--accent-glow)]" : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
    }`,

  /** Filter chips. */
  chip: (on: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-semibold transition-colors duration-fast ${
      on ? "border-accent/50 bg-accent/15 text-text-primary" : "border-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary"
    }`,

  /** Panel tabs (problem side panel, results views). */
  tab: (on: boolean) =>
    `relative inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors duration-fast ${
      on ? "bg-accent/15 text-text-primary" : "text-text-muted hover:bg-surface-hover hover:text-text-primary"
    }`,

  badge: "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",

  /** Title row across the top of a card. */
  cardHeader: "flex items-center gap-2 border-b border-border px-5 py-3.5 text-sm font-semibold text-text-primary",
  /** Caption above a figure in stat tiles. */
  statLabel: "text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted",
  /** Modal dialog shell. */
  dialog: "rounded-3xl border border-border bg-surface-raised shadow-[0_40px_120px_-30px_rgba(0,0,0,0.8)]",
} as const;

export type BadgeTone = "accent" | "success" | "warning" | "danger" | "info" | "neutral" | "gold";

export const BADGE_TONES: Record<BadgeTone, string> = {
  accent: "bg-accent/15 text-accent",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/15 text-danger",
  info: "bg-info/15 text-info",
  neutral: "bg-surface-active text-text-secondary",
  gold: "bg-[var(--roadmap-gold)]/15 text-[var(--roadmap-gold)]",
};

export const badge = (tone: BadgeTone) => `${ui.badge} ${BADGE_TONES[tone]}`;
