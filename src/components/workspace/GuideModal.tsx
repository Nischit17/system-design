"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { CATEGORY_STYLES, getComponent } from "@/lib/catalog/components";
import { ui } from "@/components/ui/styles";
import { FlowGuide } from "./WorkspaceParts";

const GROUPS: { category: keyof typeof CATEGORY_STYLES; label: string; text: string; icon: string }[] = [
  { category: "client", label: "Clients", text: "browsers and mobile apps that start requests.", icon: "web-client" },
  { category: "compute", label: "Compute", text: "application servers, workers and services that run logic.", icon: "application-server" },
  { category: "networking", label: "Networking", text: "load balancers, gateways, CDNs and routing layers.", icon: "load-balancer" },
  { category: "database", label: "Databases", text: "durable stores, caches, indexes and blob storage.", icon: "postgresql" },
  { category: "messaging", label: "Messaging", text: "queues, pub/sub and event streams for async work.", icon: "message-queue" },
  { category: "reliability", label: "Reliability", text: "health checks, replicas, backups and failure controls.", icon: "circuit-breaker" },
];

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={`${ui.card} p-5`}>
      <h3 className={ui.eyebrow}>{title}</h3>
      {children}
    </section>
  );
}

export function GuideModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-3 backdrop-blur-md motion-safe:animate-[route-settle-in_200ms_ease-out_both] sm:p-5" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="system-design-guide-title"
        className={`${ui.dialog} mx-auto my-0 flex max-h-[calc(100dvh-1.5rem)] min-h-0 w-full max-w-3xl flex-col overflow-hidden sm:max-h-[calc(100dvh-2.5rem)] motion-safe:animate-[result-reveal_260ms_var(--ease-spring-interactive)_both]`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-4 border-b border-border bg-surface-raised px-6 py-5">
          <div>
            <div className={ui.eyebrow}>System design canvas</div>
            <h2 id="system-design-guide-title" className="mt-2 text-xl font-bold text-text-primary">
              How this workspace works
            </h2>
            <p className="mt-1 text-sm text-text-secondary">Build an architecture, then use the evaluation to understand its trade-offs.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close System Design guide"
            className={ui.iconBtn}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>
        <div data-lenis-prevent className="thin-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-6">
          <div className="stagger-in grid gap-4">
            <Card title="The workflow">
              <div className="mt-4 grid gap-3 sm:grid-cols-5">
                {["Read requirements", "Place components", "Connect the graph", "Configure nodes", "Submit and learn"].map((s, i) => (
                  <div key={s} className="flex flex-col gap-2">
                    <span className="figures flex h-7 w-7 items-center justify-center rounded-full bg-accent-strong text-xs font-bold text-on-accent shadow-[0_6px_18px_-8px_var(--accent-glow)]">{i + 1}</span>
                    <p className="text-sm font-semibold text-text-primary">{s}</p>
                  </div>
                ))}
              </div>
            </Card>
            <Card title="Canvas controls">
              <ul className="mt-3 space-y-2 text-sm leading-6 text-text-secondary">
                <li>
                  <strong className="text-text-primary">Place:</strong> click a component in the library, or drag it onto the canvas.
                </li>
                <li>
                  <strong className="text-text-primary">Move:</strong> drag a node by its body.
                </li>
                <li>
                  <strong className="text-text-primary">Connect:</strong> drag from a node&apos;s right handle onto another node.
                </li>
                <li>
                  <strong className="text-text-primary">Inspect:</strong> click a node&apos;s sliders icon (or double-click it) to open its configuration.
                </li>
                <li>
                  <strong className="text-text-primary">Navigate:</strong> drag empty canvas to pan, scroll to zoom, or use the controls in the lower-right corner.
                </li>
                <li>
                  <strong className="text-text-primary">Delete:</strong> select a node or edge and press Delete, or use the trash button.
                </li>
              </ul>
            </Card>
            <Card title="Component groups">
              <ul className="mt-3 space-y-2">
                {GROUPS.map((g) => {
                  const def = getComponent(g.icon)!;
                  const Icon = def.icon;
                  const st = CATEGORY_STYLES[g.category];
                  return (
                    <li key={g.label} className="flex items-center gap-2 text-sm leading-6 text-text-secondary">
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${st.chip}`}>
                        <Icon className="h-3 w-3" aria-hidden="true" />
                      </span>
                      <span>
                        <strong className={st.text}>{g.label}:</strong> {g.text}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
            <Card title="Reading the graph">
              <p className="mt-3 text-sm leading-6 text-text-secondary">
                Edges are directed: the arrow shows where a request, a piece of data, or a message can travel. The evaluation checks meaningful paths
                and relationships, never where a node sits on the canvas.
              </p>
              <div className="mt-3 grid gap-2">
                <FlowGuide title="Good request flow" types={["web-client", "application-server", "postgresql"]} />
                <FlowGuide title="Good scale-out" types={["web-client", "load-balancer", "application-server", "postgresql"]} />
                <div className="rounded-xl border border-danger/25 bg-danger/[0.06] p-3">
                  <div className="text-xs font-semibold text-danger">Usually a problem</div>
                  <p className="mt-2 text-xs leading-5 text-text-muted">A client wired straight to the database skips every layer that validates, authorizes and protects it.</p>
                </div>
              </div>
            </Card>
            <Card title="Evaluation">
              <p className="mt-3 text-sm leading-6 text-text-secondary">
                Every problem is scored out of 100. Depending on the problem, the grader looks at components, topology, configuration, capacity under
                load, reliability during failures, and cost against a budget.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-4">
                {[
                  ["90 to 100", "Excellent", "text-success"],
                  ["80 to 89", "Strong", "text-success"],
                  ["70 to 79", "Pass", "text-accent"],
                  ["Below 70", "Keep refining", "text-warning"],
                ].map(([range, label, color]) => (
                  <div key={range} className="rounded-xl border border-border bg-background-elevated p-3">
                    <div className="figures text-xs text-text-muted">{range}</div>
                    <div className={`mt-1 text-sm font-bold ${color}`}>{label}</div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-text-muted">Passing a problem requires every hard requirement and at least the passing score shown on the results page.</p>
            </Card>
            <Card title="Feedback and retries">
              <p className="mt-3 text-sm leading-6 text-text-secondary">
                No component is right or wrong by itself; its value depends on the requirements. Feedback explains what your architecture does, which
                requirement it misses, and which trade-off to look at next.
              </p>
              <p className="mt-2 text-sm leading-6 text-text-secondary">Go back to the canvas, change the design and submit again. Every attempt and your best score are kept.</p>
            </Card>
            <Card title="Example: scaling a web application">
              <p className="mt-3 text-sm leading-6 text-text-secondary">
                When one server is saturated but the database has headroom, add a load balancer and several application servers. Route the client to
                the load balancer, connect the load balancer to each server, and keep the database behind the application tier.
              </p>
              <p className="font-code mt-3 rounded-xl border border-border bg-background-elevated px-3 py-2 text-xs text-text-primary">Client → Load Balancer → App Server A / App Server B → Database</p>
              <p className="mt-2 text-xs text-text-muted">One valid pattern, not a required diagram. Other designs score well when they meet the requirements.</p>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
