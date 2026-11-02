/**
 * Sanity checks for problem content:
 *  - every reference design passes its own grader (all hard checks, score >= passing)
 *  - an empty canvas fails
 *  - every "fix" starting graph fails (otherwise there is nothing to repair)
 * Run: npx tsx scripts/verify-problems.ts
 */
import { ALL_PROBLEMS } from "../src/lib/content/registry";
import { graphFromSpec, EMPTY_GRAPH } from "../src/lib/sim/graph";
import { evaluateDesign, evaluateScenarios } from "../src/lib/sim/evaluate";

let failures = 0;
const only = process.argv[2];
for (const p of ALL_PROBLEMS) {
  if (only && !p.id.startsWith(only)) continue;
  const ref = graphFromSpec(p.referenceDesign.graph, "ref-");
  const problems: string[] = [];
  if (p.scenarios?.length) {
    const sr = evaluateScenarios(p, ref);
    const req = sr.filter((s) => s.required);
    for (const s of req) if (!s.result.passed) problems.push(`scenario "${s.label}" fails: ${s.result.outcomes.filter((o) => !o.passed).map((o) => o.text).join(" | ")}`);
  } else {
    const r = evaluateDesign(p, ref);
    if (!r.passed) {
      const bad = r.outcomes.filter((o) => !o.passed).map((o) => `${o.soft ? "(soft) " : ""}${o.text} -> ${o.message}`);
      problems.push(`reference fails (score ${r.score}): ${bad.join(" | ")}`);
    } else if (r.score < 100) {
      const soft = r.outcomes.filter((o) => !o.passed).map((o) => o.message);
      if (soft.length) console.log(`  note ${p.id}: reference scores ${r.score} (${soft.join(" | ")})`);
    }
  }
  const empty = evaluateDesign(p, EMPTY_GRAPH);
  if (empty.passed) problems.push("empty canvas passes");
  if (p.startingGraph) {
    const start = evaluateDesign(p, graphFromSpec(p.startingGraph, "start-"));
    if (start.passed) problems.push("starting graph already passes");
  }
  if (problems.length) {
    failures++;
    console.log(`FAIL ${p.id}\n   - ${problems.join("\n   - ")}`);
  }
}
console.log(`\n${ALL_PROBLEMS.length} problems checked, ${failures} failing.`);
process.exit(failures ? 1 : 0);
