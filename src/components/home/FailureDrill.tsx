"use client";

import { useRef } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "@/components/motion/gsap";

const SERVERS = [
  { id: "s1", y: 62 },
  { id: "s2", y: 142 },
  { id: "s3", y: 222 },
  { id: "s4", y: 302 },
];
const CPU_MAX = 112;
const lbPath = (y: number) => `M262 202 C312 202 312 ${y + 28} 362 ${y + 28}`;
const dbPath = (y: number) => `M512 ${y + 28} C557 ${y + 28} 557 202 602 202`;

/** Animated failure drill: a server dies, traffic reroutes, the autoscaler adds capacity, everything recovers. */
export function FailureDrill({ label = "Failure drill animation" }: { label?: string }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const q = gsap.utils.selector(root);
      const one = <T extends Element>(sel: string) => root.current!.querySelector<T>(sel)!;
      const status = one<SVGTextElement>("[data-status]");
      const s2Label = one<SVGTextElement>("[data-label='s2']");
      const setCpu = (ids: string[], pct: number) =>
        ids.flatMap((id) => [
          gsap.to(q(`[data-cpu='${id}']`), { attr: { width: (pct / 100) * CPU_MAX }, duration: 0.8, ease: "power2.out" }),
          gsap.set(q(`[data-cpu-text='${id}']`), { textContent: `${pct}%` }),
        ]);

      SERVERS.forEach(({ id }) => {
        q(`[data-packet='${id}']`).forEach((p, i, all) =>
          gsap.to(p, {
            duration: 1.5,
            repeat: -1,
            ease: "none",
            delay: (i / all.length) * 1.5,
            motionPath: { path: one<SVGPathElement>(`[data-path='${id}']`), align: one<SVGPathElement>(`[data-path='${id}']`), alignOrigin: [0.5, 0.5] },
          }),
        );
        q(`[data-dbpacket='${id}']`).forEach((p, i, all) =>
          gsap.to(p, {
            duration: 1.3,
            repeat: -1,
            ease: "none",
            delay: (i / all.length) * 1.3,
            motionPath: { path: one<SVGPathElement>(`[data-dbpath='${id}']`), align: one<SVGPathElement>(`[data-dbpath='${id}']`), alignOrigin: [0.5, 0.5] },
          }),
        );
      });

      const s4Path = one<SVGPathElement>("[data-path='s4']");
      const len = s4Path.getTotalLength();
      gsap.set(s4Path, { strokeDasharray: len, strokeDashoffset: len });

      gsap
        .timeline({ repeat: -1, repeatDelay: 0.4 })
        .call(() => {
          status.textContent = "3 of 3 servers healthy";
          status.setAttribute("fill", "#f5f7ffaa");
        })
        .add(setCpu(["s1", "s2", "s3"], 52))
        .to(q("[data-node='s2']"), { stroke: "#ff5c7a", duration: 0.3 }, "+=2.2")
        .call(
          () => {
            status.textContent = "server-2 failed health check, rerouting";
            status.setAttribute("fill", "#ff5c7a");
            s2Label.textContent = "health check failed";
            s2Label.setAttribute("fill", "#ff5c7a");
          },
          [],
          "<",
        )
        .to(q("[data-path='s2'], [data-dbpath='s2']"), { opacity: 0.12, duration: 0.4 }, "<")
        .to(q("[data-packet='s2'], [data-dbpacket='s2']"), { autoAlpha: 0, duration: 0.3 }, "<")
        .add(setCpu(["s1", "s3"], 79), "<")
        .to(q("[data-group='s4']"), { autoAlpha: 1, y: 0, duration: 0.6, ease: "back.out(1.6)" }, "+=1.6")
        .to(s4Path, { strokeDashoffset: 0, duration: 0.7, ease: "power2.inOut" }, "<")
        .to(q("[data-dbpath='s4']"), { opacity: 1, duration: 0.5 }, "<")
        .to(q("[data-packet='s4'], [data-dbpacket='s4']"), { autoAlpha: 1, duration: 0.3 }, ">-0.1")
        .call(
          () => {
            status.textContent = "Autoscaled +1, p99 back to 61 ms";
            status.setAttribute("fill", "#3cffc2");
          },
          [],
          "<",
        )
        .add(setCpu(["s1", "s3", "s4"], 57), "<")
        .to(q("[data-node='s2']"), { stroke: "#9b82ff", duration: 0.5 }, "+=2.6")
        .call(
          () => {
            s2Label.textContent = "server-2";
            s2Label.setAttribute("fill", "#f5f7ff");
          },
          [],
          "<",
        )
        .to(q("[data-path='s2'], [data-dbpath='s2']"), { opacity: 1, duration: 0.5 }, "<")
        .to(q("[data-packet='s2'], [data-dbpacket='s2']"), { autoAlpha: 1, duration: 0.3 }, "<")
        .to(q("[data-group='s4'], [data-packet='s4'], [data-dbpacket='s4']"), { autoAlpha: 0, duration: 0.5 }, "+=0.6")
        .to(q("[data-dbpath='s4']"), { opacity: 0, duration: 0.5 }, "<")
        .set(s4Path, { strokeDashoffset: len })
        .set(q("[data-group='s4']"), { y: 10 });
    },
    { scope: root },
  );

  return (
    <div ref={root} role="img" aria-label={label} className="h-full w-full">
      <svg viewBox="0 0 720 405" className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="fd-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M24 0H0V24" fill="none" stroke="#151827" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="720" height="405" fill="#0a0b13" />
        <rect width="720" height="405" fill="url(#fd-grid)" />
        <circle cx="34" cy="28" r="4" fill="#3cffc2" />
        <text data-status x="46" y="32" fontFamily="var(--font-manrope), sans-serif" fontSize="12" fill="#f5f7ffaa">
          3 of 3 servers healthy
        </text>

        <path d="M96 202 L150 202" stroke="#5cc8ff" strokeOpacity="0.5" strokeWidth="1.5" fill="none" />
        {SERVERS.map(({ id, y }) => (
          <g key={id}>
            <path data-path={id} d={lbPath(y)} stroke={id === "s4" ? "#3cffc2" : "#9b82ff"} strokeOpacity="0.55" strokeWidth="1.5" fill="none" />
            <path data-dbpath={id} d={dbPath(y)} stroke="#3ce6b0" strokeOpacity="0.35" strokeWidth="1.5" fill="none" opacity={id === "s4" ? 0 : 1} />
          </g>
        ))}

        <circle cx="70" cy="202" r="26" fill="#0f1220" stroke="#5cc8ff" strokeWidth="1.5" />
        <text x="70" y="206" textAnchor="middle" fontFamily="var(--font-manrope), sans-serif" fontSize="11" fill="#5cc8ff">
          users
        </text>
        <rect x="150" y="172" width="112" height="60" rx="10" fill="#0f1220" stroke="#ffb547" strokeWidth="1.5" />
        <text x="206" y="200" textAnchor="middle" fontFamily="var(--font-manrope), sans-serif" fontSize="11" fill="#ffb547">
          load balancer
        </text>
        <text x="206" y="216" textAnchor="middle" fontFamily="var(--font-manrope), sans-serif" fontSize="10" fill="#f5f7ff66">
          health checks on
        </text>

        {SERVERS.map(({ id, y }) => (
          <g key={id} data-group={id} style={id === "s4" ? { opacity: 0, visibility: "hidden", transform: "translateY(10px)" } : undefined}>
            <rect data-node={id} x="362" y={y} width="150" height="56" rx="10" fill="#0f1220" stroke={id === "s4" ? "#3cffc2" : "#9b82ff"} strokeWidth="1.5" />
            <text data-label={id} x="376" y={y + 22} fontFamily="var(--font-manrope), sans-serif" fontSize="11" fill="#f5f7ff">
              {id === "s4" ? "server-4 (autoscaled)" : `server-${id.slice(1)}`}
            </text>
            <rect x="376" y={y + 32} width={CPU_MAX} height="8" rx="4" fill="#1d2134" />
            <rect data-cpu={id} x="376" y={y + 32} width={(52 / 100) * CPU_MAX} height="8" rx="4" fill={id === "s4" ? "#3cffc2" : "#9b82ff"} />
            <text data-cpu-text={id} x="494" y={y + 40} textAnchor="end" fontFamily="var(--font-manrope), sans-serif" fontSize="9" fill="#f5f7ff88">
              52%
            </text>
          </g>
        ))}

        <rect x="602" y="172" width="92" height="60" rx="10" fill="#0f1220" stroke="#3ce6b0" strokeWidth="1.5" />
        <text x="648" y="206" textAnchor="middle" fontFamily="var(--font-manrope), sans-serif" fontSize="11" fill="#3ce6b0">
          postgres
        </text>

        {SERVERS.map(({ id }) =>
          [0, 1, 2].map((i) => (
            <circle key={`${id}-p${i}`} data-packet={id} r="3.5" fill="#3cffc2" style={id === "s4" ? { opacity: 0, visibility: "hidden" } : undefined} />
          )),
        )}
        {SERVERS.map(({ id }) =>
          [0, 1].map((i) => (
            <circle key={`${id}-d${i}`} data-dbpacket={id} r="3" fill="#9b82ff" style={id === "s4" ? { opacity: 0, visibility: "hidden" } : undefined} />
          )),
        )}
      </svg>
    </div>
  );
}
