"use client";

import { useEffect, useRef, useState } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "@/components/motion/gsap";
import type { GlobeEvent } from "./GlobeScene";

type Metrics = { rps: number; p99: number; err: number; healthy: number };
type LogLine = { id: number; time: string; text: string; tone: "danger" | "info" | "success" };

const BASE: Metrics = { rps: 12400, p99: 42, err: 0.02, healthy: 8 };
const DEGRADED: Metrics = { rps: 11650, p99: 318, err: 2.4, healthy: 7 };
const TONE: Record<LogLine["tone"], string> = { danger: "text-danger", info: "text-accent", success: "text-mint" };

const clockTime = () => new Date().toLocaleTimeString("en-GB", { hour12: false });
const jitter = (spread: number) => (Math.random() - 0.5) * 2 * spread;

/** Mission-control readouts layered over the globe; reacts to the globe's failure drills. */
export function LiveHud({ event }: { event: GlobeEvent | null }) {
  const root = useRef<HTMLDivElement>(null);
  const shown = useRef<Metrics>({ ...BASE });
  const degradedRef = useRef(false);
  const rpsRef = useRef<HTMLSpanElement>(null);
  const p99Ref = useRef<HTMLSpanElement>(null);
  const errRef = useRef<HTMLSpanElement>(null);
  const healthyRef = useRef<HTMLSpanElement>(null);
  const [degraded, setDegraded] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const nextId = useRef(0);

  const paint = () => {
    const m = shown.current;
    if (rpsRef.current) rpsRef.current.textContent = `${(m.rps / 1000).toFixed(1)}k`;
    if (p99Ref.current) p99Ref.current.textContent = `${Math.round(m.p99)}`;
    if (errRef.current) errRef.current.textContent = m.err.toFixed(2);
    if (healthyRef.current) healthyRef.current.textContent = `${Math.round(m.healthy)}/8`;
  };

  const { contextSafe } = useGSAP({ scope: root });
  const tweenTo = contextSafe((target: Metrics, duration: number) => {
    gsap.to(shown.current, { ...target, duration, ease: "power2.out", overwrite: true, onUpdate: paint });
  });

  const push = (text: string, tone: LogLine["tone"]) =>
    setLog((l) => [{ id: nextId.current++, time: clockTime(), text, tone }, ...l].slice(0, 3));

  const greeted = useRef(false);
  useEffect(() => {
    paint();
    if (!greeted.current) {
      greeted.current = true;
      push("Simulator online, 8 regions healthy", "success");
    }
    if (prefersReducedMotion()) return;
    const id = setInterval(() => {
      if (degradedRef.current) return;
      tweenTo({ rps: BASE.rps + jitter(650), p99: BASE.p99 + jitter(5), err: Math.max(0.01, BASE.err + jitter(0.012)), healthy: 8 }, 1.1);
    }, 1600);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!event) return;
    if (event.type === "failure") {
      degradedRef.current = true;
      setDegraded(true);
      tweenTo(DEGRADED, 0.6);
      push(`${event.region} failed health checks`, "danger");
      setTimeout(() => push(`Traffic rerouted to ${event.fallback}`, "info"), 700);
    } else {
      degradedRef.current = false;
      setDegraded(false);
      tweenTo(BASE, 1.2);
      push(`${event.region} recovered, all regions healthy`, "success");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);

  const chip = "glass-panel rounded-xl px-3.5 py-2.5";
  const label = "figures text-[10px] uppercase tracking-[0.12em] text-text-muted";
  return (
    <div ref={root} className="pointer-events-none absolute inset-0">
      <div className={`absolute left-0 top-[8%] ${chip}`}>
        <div className={label}>Throughput</div>
        <div className="mt-0.5 figures text-lg text-text-primary">
          <span ref={rpsRef}>12.4k</span> <span className="text-xs text-text-muted">rps</span>
        </div>
      </div>
      <div className={`absolute right-0 top-[14%] ${chip}`}>
        <div className={label}>p99 latency</div>
        <div className={`mt-0.5 figures text-lg transition-colors duration-normal ${degraded ? "text-danger" : "text-text-primary"}`}>
          <span ref={p99Ref}>42</span> <span className="text-xs text-text-muted">ms</span>
        </div>
      </div>
      <div className={`absolute bottom-[12%] left-0 hidden sm:block ${chip}`}>
        <div className={label}>Error rate</div>
        <div className={`mt-0.5 figures text-lg transition-colors duration-normal ${degraded ? "text-danger" : "text-text-primary"}`}>
          <span ref={errRef}>0.02</span>
          <span className="text-xs text-text-muted">%</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2 figures text-[11px] text-text-secondary">
          <span className="status-dot" data-state={degraded ? "down" : "up"} />
          <span ref={healthyRef}>8/8</span> regions healthy
        </div>
      </div>
      <div className={`absolute bottom-[4%] right-0 hidden w-[17.5rem] md:block ${chip}`} aria-live="polite">
        <div className={label}>Failure drill log</div>
        <ul className="mt-1.5 space-y-1 figures text-[11px] leading-5">
          {log.map((l) => (
            <li key={l.id} className="flex gap-2 motion-safe:animate-[roadmap-pop-in_380ms_var(--ease-spring-interactive)_both]">
              <span className="shrink-0 text-text-muted">{l.time}</span>
              <span className={`truncate ${TONE[l.tone]}`}>{l.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
