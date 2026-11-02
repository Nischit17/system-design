import { getProblemByCode } from "../registry";
import { TRACKS, type Track, type TrackSection } from "../tracks";
import type { Block, Chapter, Guide } from "./types";
import { SERVERS_GUIDE } from "./compute-traffic";
import { CURATED_GUIDES } from "./curated";

const CURATED = new Map<string, Guide>([SERVERS_GUIDE, ...CURATED_GUIDES].map((g) => [g.sectionId, g]));

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function tierLabel(track: Track) {
  return track.tier === "Advanced" ? "Advanced" : track.tier === "Foundations" ? "Foundation" : track.family === "llm-genai-systems" ? "Applied" : "Expert";
}

/** Builds a guide from the section's problems when no hand-written guide exists yet. */
function generatedGuide(track: Track, section: TrackSection): Guide {
  const used = new Set<string>();
  const chapters: Chapter[] = section.codes.flatMap((code) => {
    const p = getProblemByCode(code);
    if (!p) return [];
    // Problem reading links point at "<section>#anchor"; reuse that anchor so the link lands on this chapter.
    const anchor = p.readingMaterials.map((r) => r.href.split("#")).find(([path, hash]) => hash && path.endsWith(section.id))?.[1];
    const id = anchor && !used.has(anchor) ? anchor : slugify(p.concepts[0] ?? p.title);
    used.add(id);
    const [first, second] = p.concepts;
    const blocks: Block[] = [];
    if (p.referenceDesign.explanation.length > 1) blocks.push(...p.referenceDesign.explanation.slice(1).map((t) => ({ type: "p" as const, text: t })));
    if (p.designGuide)
      blocks.push({
        type: "flow",
        steps: p.designGuide.flow.map((t, i) => ({ label: t.replace(/-/g, " "), tone: i === 0 ? ("warning" as const) : i === p.designGuide!.flow.length - 1 ? ("success" as const) : ("info" as const) })),
        caption: `${p.designGuide.title}: ${p.designGuide.description}`,
      });
    if (p.referenceDesign.config.length) blocks.push({ type: "key", label: "Worked example", text: p.referenceDesign.config.join(" ") });
    if (second) blocks.push({ type: "h3", text: second });
    if (p.designGuide?.notes?.length) blocks.push({ type: "list", items: p.designGuide.notes });
    return [
      {
        id,
        kicker: p.title,
        title: first ?? p.title,
        navTitle: first ?? p.title,
        summary: second ? `${first} and ${second.toLowerCase()}.` : p.description.slice(0, 90),
        intro: [p.referenceDesign.explanation[0] ?? p.description],
        blocks,
      },
    ];
  });
  return {
    sectionId: section.id,
    kicker: `Section ${String(section.number).padStart(2, "0")} · ${tierLabel(track)}`,
    title: section.title,
    intro: section.description,
    byTheEnd: `You can explain the trade-offs behind every ${section.title.toLowerCase()} lab in this section and defend your design choices with numbers.`,
    chapters,
  };
}

export function getGuide(sectionId: string): { guide: Guide; track: Track; section: TrackSection } | null {
  for (const track of TRACKS) {
    const section = track.sections.find((s) => s.id === sectionId);
    if (section) return { guide: CURATED.get(sectionId) ?? generatedGuide(track, section), track, section };
  }
  return null;
}

export function guideStats(sectionId: string): { chapters: number; labs: number } {
  const g = getGuide(sectionId);
  return g ? { chapters: g.guide.chapters.length + 1, labs: g.section.codes.length } : { chapters: 0, labs: 0 };
}

export function hasCuratedGuide(sectionId: string) {
  return CURATED.has(sectionId);
}
