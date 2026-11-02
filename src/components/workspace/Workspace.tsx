"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Compass,
  Info,
  LayoutGrid,
  Lightbulb,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Send,
  SlidersHorizontal,
  Trophy,
} from "lucide-react";
import type { ConfigValue } from "@/lib/catalog/components";
import { getProblem, nextProblem } from "@/lib/content/registry";
import type { Difficulty } from "@/lib/content/types";
import { connect, createNode, duplicateNode, EMPTY_GRAPH, graphFromSpec, NODE_HEIGHT, NODE_WIDTH, removeEdge, removeNode, type Graph } from "@/lib/sim/graph";
import { evaluateDesign, evaluateScenarios, liveRequirementChecks, makeCtx, type EvaluationResult, type ScenarioResult } from "@/lib/sim/evaluate";
import { useUserData } from "@/lib/store/user-data";
import { SITE } from "@/lib/site";
import { LogoMark } from "@/components/site/Logo";
import { SpotlightTour, type TourStep } from "@/components/site/SpotlightTour";
import { badge, ui, type BadgeTone } from "@/components/ui/styles";
import { AdvanceOverlay } from "./AdvanceOverlay";
import { ComponentLibrary, RequiredComponents } from "./ComponentLibrary";
import { DesignCanvas, type Selection } from "./DesignCanvas";
import { GuideModal } from "./GuideModal";
import { Inspector } from "./Inspector";
import { ChecklistResults, ScenarioResults, SimulationResults, type AttemptRow } from "./Results";
import { ComponentReference, ConfigurationSummary, FlowGuide, ProductionMetricsBar, ReadingLinks, RequirementsList, SECTION_LABEL } from "./WorkspaceParts";

type SideTab = "problem" | "requirements" | "hint" | "reference";
type View = "design" | "results" | "reference";

const storageKey = (id: string, what: string) => `cp-sd-${what}-${id}`;

const DIFFICULTY_BADGE: Record<Difficulty, BadgeTone> = { Easy: "success", Medium: "warning", Hard: "danger" };

const VIEWS = [
  { value: "design", label: "Canvas", icon: LayoutGrid },
  { value: "results", label: "Results", icon: CheckCircle2 },
  { value: "reference", label: "Solution", icon: Lightbulb },
] as const;

const INSPECTOR_SHADOW = { boxShadow: "0 28px 64px -24px rgba(0, 0, 0, 0.75)" };

const CANVAS_TOUR: (TourStep & { view: SideTab | "canvas" })[] = [
  {
    target: "sidebar",
    title: "Start with the problem",
    description: "Read the scenario (and, when fixing a design, the production metrics) before touching the architecture. They say what is broken and what must stay intact.",
    view: "problem",
  },
  {
    target: "sidebar",
    title: "Turn requirements into checks",
    description: "Treat this list as your design contract. Most problems tick these checks live as you add, connect and configure components.",
    view: "requirements",
  },
  {
    target: "sidebar",
    title: "Add required components",
    description: "The Problem tab lists the components this exercise needs. Click one to place it, or drag it onto the canvas.",
    view: "problem",
  },
  {
    target: "workspace-tabs",
    title: "Move between workspace views",
    description: "Canvas is your editable design. Results explains your score after you submit, and Solution shows one valid reference architecture.",
    view: "canvas",
  },
  {
    target: "canvas",
    title: "Build and inspect the architecture",
    description: "Drag nodes to arrange them, connect from a node's right handle, and pan or zoom with the corner controls.",
    view: "canvas",
  },
  {
    target: "component-configuration",
    fallbackTarget: "canvas",
    title: "Edit component configuration",
    description: "Use the sliders button on any component card to open its configuration: size, instances, routing, TTLs and more.",
    view: "canvas",
    extra: (
      <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-accent/40 bg-accent-soft px-3 py-2 text-xs font-semibold text-text-primary">
        <SlidersHorizontal className="h-4 w-4 text-accent" aria-hidden="true" />
        Click this icon on a component
      </div>
    ),
  },
  {
    target: "submission",
    title: "Submit, learn, and iterate",
    description: "Reset restores the starting design. Submit evaluates topology, configuration, capacity, reliability and cost, and your best score is kept across retries.",
    view: "canvas",
  },
];

export function Workspace({ problemId }: { problemId: string }) {
  const problem = getProblem(problemId)!;
  const params = useSearchParams();
  const fromProblems = params.get("from") === "problems";
  const user = useUserData();

  const startingGraph = useMemo(() => (problem.startingGraph ? graphFromSpec(problem.startingGraph) : null), [problem]);
  const referenceGraph = useMemo(() => graphFromSpec(problem.referenceDesign.graph, "ref-"), [problem]);
  const next = useMemo(() => nextProblem(problem), [problem]);

  const [graph, setGraph] = useState<Graph>(EMPTY_GRAPH);
  const [hydrated, setHydrated] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [inspecting, setInspecting] = useState<string | null>(null);
  const [refSelection, setRefSelection] = useState<Selection>(null);
  const [refInspecting, setRefInspecting] = useState<string | null>(null);
  const [view, setView] = useState<View>("design");
  const [sideTab, setSideTab] = useState<SideTab>("problem");
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [scenarioResults, setScenarioResults] = useState<ScenarioResult[] | null>(null);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [panelHidden, setPanelHidden] = useState(false);
  const [panelWidth, setPanelWidth] = useState(390);
  const [resizing, setResizing] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  // load saved draft + attempts
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey(problem.id, "graph"));
      const savedAttempts = localStorage.getItem(storageKey(problem.id, "attempts"));
      setGraph(saved ? (JSON.parse(saved) as Graph) : (startingGraph ?? EMPTY_GRAPH));
      if (savedAttempts) setAttempts(JSON.parse(savedAttempts) as AttemptRow[]);
    } catch {
      setGraph(startingGraph ?? EMPTY_GRAPH);
    }
    setHydrated(true);
  }, [problem.id, startingGraph]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKey(problem.id, "graph"), JSON.stringify(graph));
    } catch {
      /* ignore */
    }
  }, [graph, hydrated, problem.id]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKey(problem.id, "attempts"), JSON.stringify(attempts));
    } catch {
      /* ignore */
    }
  }, [attempts, hydrated, problem.id]);

  // opening a problem marks it in progress
  useEffect(() => {
    user.markOpened(problem.id);
  }, [user.markOpened, problem.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // phones get the panel as a drawer over the canvas, closed by default
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    if (mq.matches) setPanelHidden(true);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const live = useMemo(() => liveRequirementChecks(problem, graph), [problem, graph]);
  const budget = problem.sim?.budgetMaxUsd;
  const cost = useMemo(() => (budget !== undefined ? makeCtx(graph, problem.sim).cost() : null), [graph, budget, problem.sim]);
  const overBudget = cost !== null && budget !== undefined && cost > budget;
  const best = attempts.reduce((m, a) => Math.max(m, a.score), 0);
  const solved = !!(result?.passed || (scenarioResults && scenarioResults.filter((s) => s.required).every((s) => s.result.passed)));
  const hasResults = !!(result || scenarioResults);
  const sideWidth = narrow ? Math.min(panelWidth, 330) : panelWidth;

  const addAt = useCallback((type: string, x: number, y: number) => {
    setGraph((g) => {
      const node = createNode(type, x, y);
      return node ? { ...g, nodes: [...g.nodes, node] } : g;
    });
  }, []);
  const addComponent = useCallback(
    (type: string) => {
      setGraph((g) => {
        const n = g.nodes.length;
        const node = createNode(type, 80 + (n % 3) * (NODE_WIDTH + 80), 70 + Math.floor(n / 3) * (NODE_HEIGHT + 70));
        return node ? { ...g, nodes: [...g.nodes, node] } : g;
      });
      if (narrow) setPanelHidden(true);
    },
    [narrow],
  );
  const moveNode = useCallback((id: string, x: number, y: number) => {
    setGraph((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)) }));
  }, []);
  const connectNodes = useCallback((a: string, b: string) => setGraph((g) => connect(g, a, b)), []);
  const deleteSelection = useCallback(() => {
    setSelection((sel) => {
      if (sel) setGraph((g) => (sel.kind === "node" ? removeNode(g, sel.id) : removeEdge(g, sel.id)));
      return null;
    });
    setInspecting(null);
  }, []);
  const changeConfig = useCallback((id: string, key: string, value: ConfigValue) => {
    setGraph((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, config: { ...n.config, [key]: value } } : n)) }));
  }, []);

  const submit = () => {
    let score = 0;
    let passed = false;
    if (problem.scenarios?.length) {
      const sr = evaluateScenarios(problem, graph);
      const req = sr.filter((s) => s.required);
      const total = req.reduce((s, r) => s + r.result.maxScore, 0);
      score = total ? Math.round((req.reduce((s, r) => s + r.result.score, 0) / total) * 100) : 0;
      passed = req.every((r) => r.result.passed);
      setScenarioResults(sr);
      setResult(null);
    } else {
      const r = evaluateDesign(problem, graph);
      score = r.score;
      passed = r.passed;
      setResult(r);
      setScenarioResults(null);
    }
    setAttempts((a) => [...a, { attempt: a.length + 1, score, passed, at: Date.now() }]);
    user.recordAttempt(problem.id, score, passed);
    setView("results");
  };

  const reset = () => {
    setGraph(startingGraph ?? EMPTY_GRAPH);
    setSelection(null);
    setInspecting(null);
    setResult(null);
    setScenarioResults(null);
    setView("design");
  };

  const onTourStep = useCallback((i: number) => {
    const step = CANVAS_TOUR[i];
    setPanelHidden(false);
    if (step.view === "canvas") setView("design");
    else setSideTab(step.view);
  }, []);

  const backHref = fromProblems ? "/problems" : `/tracks/${problem.trackSlug}#problem-${problem.code.replace(/^FTS/, "SSA")}`;
  const inspectedNode = inspecting ? graph.nodes.find((n) => n.id === inspecting) : null;
  const refInspectedNode = refInspecting ? referenceGraph.nodes.find((n) => n.id === refInspecting) : null;
  const sideTabs: { value: SideTab; label: string; icon: typeof Info }[] = [
    { value: "problem", label: "Problem", icon: Info },
    { value: "requirements", label: "Requirements", icon: CheckCircle2 },
    ...(problem.designGuide ? [{ value: "hint" as const, label: "Hint", icon: Lightbulb }] : []),
    { value: "reference", label: "Reference", icon: BookOpen },
  ];

  const sidebarBody = (
    <div key={sideTab} className="stagger-in flex min-h-full flex-col gap-5 p-4">
      {sideTab === "problem" && (
        <>
          <section>
            <h2 className={SECTION_LABEL}>Problem</h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">{problem.description}</p>
          </section>
          <RequiredComponents types={problem.availableComponents} onAdd={addComponent} />
          <ComponentLibrary onAdd={addComponent} />
        </>
      )}
      {sideTab === "requirements" && <RequirementsList problem={problem} live={live} />}
      {sideTab === "hint" && problem.designGuide && (
        <section>
          <h2 className={SECTION_LABEL}>Expected design</h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">{problem.designGuide.description}</p>
          <div className="mt-3 space-y-2">
            <FlowGuide title={problem.designGuide.title} types={problem.designGuide.flow} />
            {problem.designGuide.secondary && <FlowGuide title={problem.designGuide.secondary.title} types={problem.designGuide.secondary.flow} />}
            {problem.designGuide.extra?.map((f) => <FlowGuide key={f.title} title={f.title} types={f.flow} />)}
          </div>
          {!!problem.designGuide.notes?.length && (
            <ul className="mt-4 space-y-2">
              {problem.designGuide.notes.map((n) => (
                <li key={n} className="flex gap-2.5 text-[13px] leading-5 text-text-muted">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {sideTab === "reference" && (
        <>
          <ReadingLinks problem={problem} />
          {problem.sim && <ComponentReference showDatabase={problem.availableComponents.some((c) => c === "postgresql" || c === "mysql")} />}
        </>
      )}
    </div>
  );

  const resultProps = { problem, attempts, best, onReturn: () => setView("design"), onReference: () => setView("reference") };

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-background text-text-primary motion-safe:animate-[enter-workspace_360ms_var(--ease-spring-interactive)_both]">
      <header className="relative z-30 flex shrink-0 items-center justify-between gap-3 border-b border-border bg-background/80 px-3 py-2.5 backdrop-blur-xl sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <Link href="/" aria-label={`${SITE.name} home`} title={`${SITE.name} home`} className={`${ui.iconBtn} border-transparent max-sm:hidden`}>
            <LogoMark className="h-5 w-5" />
          </Link>
          <Link href={backHref} className={`${ui.btnGhost} ${ui.btnSm} shrink-0`}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{fromProblems ? "Problems" : "Track"}</span>
          </Link>
          <span aria-hidden="true" className="hidden h-5 w-px shrink-0 bg-border sm:block" />
          <span className={`${badge("accent")} figures shrink-0 max-sm:hidden`}>{problem.code}</span>
          <h1 className="min-w-0 truncate text-sm font-semibold text-text-primary sm:text-[15px]">{problem.title}</h1>
          <span className={`${badge(DIFFICULTY_BADGE[problem.difficulty])} shrink-0 max-md:hidden`}>{problem.difficulty}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {best > 0 && (
            <span className={`${badge("success")} figures max-lg:hidden`}>
              <Trophy className="h-3 w-3" aria-hidden="true" />
              Best {best}/100
            </span>
          )}
          <button type="button" onClick={() => setGuideOpen(true)} aria-label="How System Design works" title="How System Design works" className={ui.iconBtn}>
            <Info className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => setTourOpen(true)} aria-label="Canvas guide" className={`${ui.btnSecondary} ${ui.btnSm} max-sm:!px-2.5`}>
            <Compass className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Canvas guide</span>
          </button>
          <button
            type="button"
            onClick={() => setPanelHidden((h) => !h)}
            aria-label={panelHidden ? "Show panel" : "Hide panel"}
            aria-expanded={!panelHidden}
            className={`${ui.btnSecondary} ${ui.btnSm} max-sm:!px-2.5`}
          >
            {panelHidden ? <PanelLeftOpen className="h-3.5 w-3.5" aria-hidden="true" /> : <PanelLeftClose className="h-3.5 w-3.5" aria-hidden="true" />}
            <span className="hidden sm:inline">{panelHidden ? "Show panel" : "Hide panel"}</span>
          </button>
        </div>
      </header>

      <div
        className="relative flex min-h-0 flex-1"
        onPointerMove={(e) => resizing && setPanelWidth(Math.min(560, Math.max(260, e.clientX)))}
        onPointerUp={() => setResizing(false)}
        onPointerLeave={() => setResizing(false)}
      >
        {narrow && !panelHidden && (
          <button type="button" aria-label="Close panel" onClick={() => setPanelHidden(true)} className="absolute inset-0 z-20 bg-black/55 backdrop-blur-[2px]" />
        )}
        <aside
          data-tour="sidebar"
          className={`flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-border bg-background-elevated max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-30 max-md:shadow-[24px_0_60px_-20px_rgba(0,0,0,0.8)] ${
            resizing ? "" : "transition-[width] duration-slow ease-spring-interactive"
          }`}
          style={{ width: panelHidden ? 0 : sideWidth, borderRightWidth: panelHidden ? 0 : undefined }}
        >
          <div className="shrink-0 border-b border-border p-2.5" style={{ width: sideWidth }}>
            <div role="tablist" aria-label="Problem panel" className={`${ui.segment} flex w-full`}>
              {sideTabs.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  aria-selected={sideTab === t.value}
                  onClick={() => setSideTab(t.value)}
                  className={`${ui.segmentItem(sideTab === t.value)} flex-1 justify-center !px-2`}
                >
                  <t.icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div data-lenis-prevent className="thin-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div style={{ width: sideWidth, minHeight: "100%" }}>{sidebarBody}</div>
          </div>
        </aside>
        {!panelHidden && !narrow && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panel"
            onPointerDown={(e) => {
              e.preventDefault();
              setResizing(true);
            }}
            className={`relative z-10 -ml-[3px] w-1.5 shrink-0 cursor-col-resize rounded-full transition-colors duration-fast hover:bg-accent/60 ${resizing ? "bg-accent" : ""}`}
          />
        )}

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-3 pt-3 sm:px-4">
            <div data-tour="workspace-tabs" role="tablist" aria-label="Workspace view" className={ui.segment}>
              {VIEWS.map((t) => {
                const disabled = t.value === "results" && !hasResults;
                return (
                  <button
                    key={t.value}
                    type="button"
                    role="tab"
                    aria-selected={view === t.value}
                    disabled={disabled}
                    onClick={() => setView(t.value)}
                    title={disabled ? "Submit a design first" : undefined}
                    className={`${ui.segmentItem(view === t.value)} disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent`}
                  >
                    <t.icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {t.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-4 text-xs text-text-muted">
              <span className="figures hidden md:inline">
                {graph.nodes.length} {graph.nodes.length === 1 ? "component" : "components"} · {graph.edges.length}{" "}
                {graph.edges.length === 1 ? "connection" : "connections"}
              </span>
              <span className="inline-flex items-center gap-2" title="Your design is saved in this browser as you work">
                <span className="status-dot" aria-hidden="true" />
                <span className="hidden sm:inline">Saved in this browser</span>
              </span>
            </div>
          </div>
          <div data-lenis-prevent className={`thin-scrollbar min-h-0 min-w-0 flex-1 ${view === "design" ? "overflow-hidden" : "overflow-y-auto"}`}>
            {view === "design" && (
              <div data-tour="canvas" className="relative flex h-full flex-col p-3 sm:p-4">
                {problem.startingMetrics && (
                  <ProductionMetricsBar metrics={problem.startingMetrics} cpuMaxPercent={problem.sim?.cpuMaxPercent} budgetMaxUsd={problem.sim?.budgetMaxUsd} />
                )}
                <div className="relative min-h-0 flex-1">
                  <DesignCanvas
                    graph={graph}
                    selection={selection}
                    onSelectionChange={(s) => {
                      setSelection(s);
                      if (!s || s.kind !== "node") setInspecting(null);
                    }}
                    onOpenConfiguration={(id) => {
                      setSelection({ kind: "node", id });
                      setInspecting(id);
                    }}
                    onMoveNode={moveNode}
                    onConnect={connectNodes}
                    onDropComponent={addAt}
                    onDeleteSelection={deleteSelection}
                    sim={problem.sim}
                  />
                  {inspectedNode && (
                    <div className="pointer-events-none absolute bottom-16 right-3 top-3 z-20 flex w-[min(20rem,calc(100%-1.5rem))] flex-col sm:right-5 sm:top-5">
                      <div className="pointer-events-auto flex min-h-0 flex-col rounded-2xl motion-safe:animate-[result-reveal_220ms_var(--ease-spring-interactive)_both]" style={INSPECTOR_SHADOW}>
                        <Inspector
                          key={inspectedNode.id}
                          node={inspectedNode}
                          graph={graph}
                          onChangeConfig={changeConfig}
                          onDuplicate={(id) => {
                            const src = graph.nodes.find((n) => n.id === id);
                            if (!src) return;
                            const copy = duplicateNode(src);
                            setGraph((g) => ({ ...g, nodes: [...g.nodes, copy] }));
                            setSelection({ kind: "node", id: copy.id });
                            setInspecting(copy.id);
                          }}
                          onDelete={(id) => {
                            setGraph((g) => removeNode(g, id));
                            setSelection(null);
                            setInspecting(null);
                          }}
                          onClose={() => setInspecting(null)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {view === "results" && scenarioResults && <ScenarioResults key={attempts.length} {...resultProps} scenarios={scenarioResults} />}
            {view === "results" && result && result.graded === "simulation" && <SimulationResults key={attempts.length} {...resultProps} result={result} />}
            {view === "results" && result && result.graded === "checklist" && <ChecklistResults key={attempts.length} {...resultProps} result={result} />}
            {view === "reference" && (
              <div className="stagger-in w-full space-y-6 p-3 sm:p-6">
                <div>
                  <p className={ui.eyebrow}>Solution</p>
                  <h2 className="mt-2 text-2xl font-bold text-text-primary">Reference design</h2>
                  <p className="mt-1.5 text-sm text-text-muted">One valid architecture for these requirements; not the only correct answer.</p>
                </div>
                <div className="relative">
                  <div className="h-[70vh] min-h-[480px]">
                    <DesignCanvas
                      graph={referenceGraph}
                      selection={refSelection}
                      onSelectionChange={(s) => {
                        setRefSelection(s);
                        setRefInspecting(null);
                      }}
                      onOpenConfiguration={(id) => {
                        setRefSelection({ kind: "node", id });
                        setRefInspecting(id);
                      }}
                      onMoveNode={() => {}}
                      onConnect={() => {}}
                      onDropComponent={() => {}}
                      onDeleteSelection={() => {}}
                      sim={problem.sim}
                      readOnly
                      initialView={{ x: 24, y: 24, scale: 0.9 }}
                    />
                  </div>
                  {refInspectedNode && (
                    <div className="pointer-events-none absolute bottom-16 right-3 top-3 z-20 flex w-[min(20rem,calc(100%-1.5rem))] flex-col sm:right-5 sm:top-5">
                      <div className="pointer-events-auto flex min-h-0 flex-col rounded-2xl motion-safe:animate-[result-reveal_220ms_var(--ease-spring-interactive)_both]" style={INSPECTOR_SHADOW}>
                        <Inspector
                          node={{ ...refInspectedNode, locked: true }}
                          graph={referenceGraph}
                          onChangeConfig={() => {}}
                          onDuplicate={() => {}}
                          onDelete={() => {}}
                          onClose={() => setRefInspecting(null)}
                        />
                      </div>
                    </div>
                  )}
                </div>
                <ConfigurationSummary graph={referenceGraph} />
                <div className="max-w-3xl space-y-5">
                  {problem.referenceDesign.config.length > 0 && (
                    <section className="rounded-2xl border border-accent/30 bg-accent-soft p-5">
                      <h3 className={ui.eyebrow}>Recommended configuration</h3>
                      <ul className="mt-3 space-y-2">
                        {problem.referenceDesign.config.map((c) => (
                          <li key={c} className="flex gap-2.5 text-sm leading-6 text-text-secondary">
                            <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                            <span>{c}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                  <div className="space-y-3">
                    {problem.referenceDesign.explanation.map((p) => (
                      <p key={p} className="text-[15px] leading-7 text-text-secondary">
                        {p}
                      </p>
                    ))}
                  </div>
                  <button type="button" onClick={() => setView("design")} className={ui.btnSecondary}>
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    Return to design
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <footer
        data-tour="submission"
        className="relative z-30 flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border bg-background/85 px-3 py-2.5 backdrop-blur-xl sm:px-4"
      >
        <button type="button" onClick={reset} className={`${ui.btnGhost} ${ui.btnSm} hover:!bg-danger/10 hover:!text-danger`}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Reset design
        </button>
        {cost !== null && budget !== undefined && (
          <div className="order-last flex w-full justify-center sm:order-none sm:w-auto sm:flex-1">
            <div
              className={`flex w-full max-w-md items-center gap-3 rounded-full border px-4 py-1.5 transition-colors duration-normal ${
                overBudget ? "border-danger/40 bg-danger/10" : "border-border bg-surface/80"
              }`}
              title="Monthly cost of this design against the problem's budget"
            >
              <span className={`${ui.statLabel} shrink-0`}>Cost</span>
              <div className="h-1.5 min-w-12 flex-1 overflow-hidden rounded-full bg-surface-active">
                <div
                  className={`h-full rounded-full transition-[width] duration-slow ease-spring-interactive ${overBudget ? "bg-danger" : cost / budget >= 0.85 ? "bg-warning" : "bg-success"}`}
                  style={{ width: `${Math.min((cost / budget) * 100, 100)}%` }}
                />
              </div>
              <span className={`figures shrink-0 text-xs font-semibold ${overBudget ? "text-danger" : "text-text-primary"}`}>
                ${Math.round(cost).toLocaleString()} <span className="font-medium text-text-muted">/ ${budget.toLocaleString()}</span>
              </span>
            </div>
          </div>
        )}
        <div className="flex shrink-0 items-center gap-2">
          {view !== "design" && (
            <button type="button" onClick={() => setView("design")} className={`${ui.btnSecondary} ${ui.btnSm} max-sm:hidden`}>
              Back to canvas
            </button>
          )}
          <button type="button" onClick={submit} disabled={graph.nodes.length === 0} className={`${ui.btnPrimary} max-sm:!px-4`}>
            <Send className="h-4 w-4" aria-hidden="true" />
            {attempts.length > 0 ? "Submit again" : "Submit design"}
          </button>
          {solved && next && (
            <button type="button" onClick={() => setAdvancing(true)} className={`${ui.btnGold} max-sm:!px-4`}>
              Next problem
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          {solved && !next && (
            <Link href={`/tracks/${problem.trackSlug}`} className={`${ui.btnGold} max-sm:!px-4`}>
              Track complete
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
        </div>
      </footer>

      {advancing && next && (
        <AdvanceOverlay
          current={{ code: problem.code, title: problem.title }}
          next={{ code: next.code, title: next.title }}
          href={`/problems/${next.id}`}
          onClose={() => setAdvancing(false)}
        />
      )}
      {tourOpen && <SpotlightTour label="Canvas guide" steps={CANVAS_TOUR} onClose={() => setTourOpen(false)} onStepChange={onTourStep} />}
      {guideOpen && <GuideModal onClose={() => setGuideOpen(false)} />}
    </main>
  );
}
