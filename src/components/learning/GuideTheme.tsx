"use client";

import { useCallback, useLayoutEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { ui } from "@/components/ui/styles";
import { GUIDE_THEME_KEY } from "./guide-theme-script";

export type GuideTheme = "dark" | "light";

/** Reading theme for guides, saved in this browser. Defaults to dark like the rest of the site. */
export function useGuideTheme() {
  const [theme, setThemeState] = useState<GuideTheme>("dark");
  // client-side navigations skip the route's inline script, so sync from storage before paint
  useLayoutEffect(() => {
    let saved: GuideTheme = "dark";
    try {
      saved = localStorage.getItem(GUIDE_THEME_KEY) === "light" ? "light" : "dark";
    } catch {
      /* storage blocked: stay dark */
    }
    document.documentElement.dataset.guideTheme = saved;
    setThemeState(saved);
  }, []);
  const setTheme = useCallback((next: GuideTheme) => {
    const apply = () => {
      document.documentElement.dataset.guideTheme = next;
      setThemeState(next);
    };
    try {
      localStorage.setItem(GUIDE_THEME_KEY, next);
    } catch {
      /* private mode: theme still applies for this visit */
    }
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (doc.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) doc.startViewTransition(apply);
    else apply();
  }, []);
  return [theme, setTheme] as const;
}

/** Light / dark segmented switch for the reading surface. */
export function GuideThemeToggle({ theme, onChange, compact = false }: { theme: GuideTheme; onChange: (t: GuideTheme) => void; compact?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Reading theme" className={ui.segment}>
      {(
        [
          { value: "light", label: "Light", icon: Sun },
          { value: "dark", label: "Dark", icon: Moon },
        ] as const
      ).map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={theme === o.value}
          aria-label={`${o.label} theme`}
          title={`${o.label} theme`}
          onClick={() => onChange(o.value)}
          className={`${ui.segmentItem(theme === o.value)} ${compact ? "!px-2" : ""}`}
        >
          <o.icon className="h-3.5 w-3.5" aria-hidden="true" />
          {!compact && o.label}
        </button>
      ))}
    </div>
  );
}

/** Floating switch for small screens, where the chapter sidebar is hidden. */
export function GuideThemeFab({ theme, onChange }: { theme: GuideTheme; onChange: (t: GuideTheme) => void }) {
  const next = theme === "light" ? "dark" : "light";
  return (
    <button
      type="button"
      onClick={() => onChange(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="glass-panel btn-press fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full text-text-primary shadow-[0_16px_40px_-16px_rgba(0,0,0,0.6)] lg:hidden"
    >
      {theme === "light" ? <Moon className="h-5 w-5" aria-hidden="true" /> : <Sun className="h-5 w-5" aria-hidden="true" />}
    </button>
  );
}
