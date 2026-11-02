import { TOTAL_PROBLEM_COUNT } from "@/lib/content/registry";
import { SiteHeaderClient } from "./SiteHeaderClient";

/** Sticky site header. Server wrapper so the problem count never pulls the catalogue into client bundles. */
export function SiteHeader({ className = "mb-8" }: { className?: string }) {
  return <SiteHeaderClient className={className} totalProblems={TOTAL_PROBLEM_COUNT} />;
}
