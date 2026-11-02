/**
 * Sanity checks for learning guides:
 *  - every roadmap section has a hand-written guide, and no guide points at a missing section
 *  - chapter ids are unique within a guide
 *  - every problem's reading link anchor matches a chapter id in its section's guide
 *  - list-like blocks have unique entries (they double as React keys)
 *  - the kicker's section number matches the section
 * Run: npx tsx scripts/verify-guides.ts
 */
import { ALL_PROBLEMS } from "../src/lib/content/registry";
import { TRACKS } from "../src/lib/content/tracks";
import { SERVERS_GUIDE } from "../src/lib/content/learning/compute-traffic";
import { CURATED_GUIDES } from "../src/lib/content/learning/curated";
import type { Block, Guide } from "../src/lib/content/learning/types";

const guides: Guide[] = [SERVERS_GUIDE, ...CURATED_GUIDES];
const issues: string[] = [];
const sections = new Map(TRACKS.flatMap((t) => t.sections.map((s) => [s.id, s] as const)));

const dupes = (values: string[]) => values.filter((v, i) => values.indexOf(v) !== i);
function blockKeys(b: Block): string[][] {
  switch (b.type) {
    case "bars":
      return [b.items.map((i) => i.label)];
    case "compare":
      return [b.items.map((i) => i.title), ...b.items.map((i) => i.points)];
    case "list":
      return [b.items];
    case "terms":
      return [b.items.map(([t]) => t)];
    default:
      return [];
  }
}

const seenSections = new Set<string>();
for (const g of guides) {
  const where = `${g.sectionId} (${g.title})`;
  const section = sections.get(g.sectionId);
  if (!section) {
    issues.push(`${where}: no such section`);
    continue;
  }
  if (seenSections.has(g.sectionId)) issues.push(`${where}: duplicate guide for section`);
  seenSections.add(g.sectionId);
  if (!g.kicker.startsWith(`Section ${String(section.number).padStart(2, "0")} `)) issues.push(`${where}: kicker "${g.kicker}" doesn't match section number ${section.number}`);
  const ids = g.chapters.map((c) => c.id);
  for (const d of dupes(ids)) issues.push(`${where}: duplicate chapter id "${d}"`);
  for (const c of g.chapters) for (const b of c.blocks) for (const keys of blockKeys(b)) for (const d of dupes(keys)) issues.push(`${where} › ${c.id}: duplicate ${b.type} entry "${d}"`);
  const anchors = ALL_PROBLEMS.filter((p) => p.sectionId === g.sectionId).flatMap((p) =>
    p.readingMaterials.map((r) => r.href.split("#")).filter(([path, hash]) => hash && path.endsWith(g.sectionId)).map(([, hash]) => ({ code: p.code, hash })),
  );
  for (const a of anchors) if (!ids.includes(a.hash)) issues.push(`${where}: ${a.code} links to #${a.hash}, which has no chapter`);
}
for (const id of sections.keys()) if (!seenSections.has(id)) issues.push(`${id}: no hand-written guide`);

for (const i of issues) console.log(`FAIL ${i}`);
const chapters = guides.reduce((n, g) => n + g.chapters.length, 0);
console.log(`\n${guides.length} guides, ${chapters} chapters checked, ${issues.length} issue(s).`);
process.exit(issues.length ? 1 : 0);
