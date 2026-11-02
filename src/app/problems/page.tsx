import type { Metadata } from "next";
import { ProblemsBrowser } from "@/components/problems/ProblemsBrowser";
import { PopularSidebar } from "@/components/problems/PopularSidebar";
import { PageFrame } from "@/components/site/PageFrame";
import { HeadingStats, PageHeading } from "@/components/site/PageHeading";
import { ALL_PROBLEMS } from "@/lib/content/registry";
import { TRACKS } from "@/lib/content/tracks";
import { toSummary } from "@/lib/content/summaries";

export const metadata: Metadata = {
  title: "System Design Problems",
  description: "Hands-on system design problems graded by a capacity, latency and cost simulator.",
};

export default function ProblemsPage() {
  const problems = ALL_PROBLEMS.map(toSummary);
  return (
    <PageFrame>
      <div className="relative mx-auto max-w-[1680px] px-5 sm:px-10">
        <PageHeading
          eyebrow="Problems"
          title="System design problems"
          subtitle="Pick a scenario, build the architecture on a live canvas, and let the simulator load-test it. Every problem is free and works without an account."
          aside={
            <HeadingStats
              items={[
                { label: "Problems", value: problems.length },
                { label: "Tracks", value: TRACKS.length },
                { label: "Sign-in", value: "None" },
              ]}
            />
          }
        />
      </div>
      <div className="relative mx-auto flex max-w-[1680px] items-start gap-8 px-5 pb-10 sm:px-10">
        <div className="min-w-0 flex-1">
          <ProblemsBrowser problems={problems} />
        </div>
        <PopularSidebar />
      </div>
    </PageFrame>
  );
}
