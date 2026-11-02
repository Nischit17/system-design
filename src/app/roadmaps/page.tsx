import type { Metadata } from "next";
import { Suspense } from "react";
import { PopularSidebar } from "@/components/problems/PopularSidebar";
import { RoadmapsView } from "@/components/roadmaps/RoadmapsView";
import { PageFrame } from "@/components/site/PageFrame";
import { PageHeading } from "@/components/site/PageHeading";
import { ALL_PROBLEMS } from "@/lib/content/registry";
import { codeInfoMap } from "@/lib/content/roadmap-data";
import { TRACKS } from "@/lib/content/tracks";

export const metadata: Metadata = {
  title: "System Design Roadmaps",
  description: "Structured roadmaps from compute and traffic foundations to expert-level product designs, ML systems and LLM systems.",
};

export default function RoadmapsPage() {
  const titles = Object.fromEntries(ALL_PROBLEMS.map((p) => [p.id, { title: p.title, difficulty: p.difficulty, minutes: p.estimatedMinutes }]));
  return (
    <PageFrame className="relative min-h-screen overflow-hidden text-text-primary">
      <div className="relative mx-auto max-w-[1680px] px-5 sm:px-10">
        <PageHeading
          eyebrow="Roadmaps"
          title="Structured roadmaps, one section at a time"
          subtitle="Follow a track from foundations to expert designs. Each section pairs a guide with problems, and your progress is saved in this browser."
        />
      </div>
      <div className="relative mx-auto flex max-w-[1680px] items-start gap-8 px-5 pb-10 sm:px-10">
        <div className="min-w-0 flex-1">
          <Suspense>
            <RoadmapsView tracks={TRACKS} codes={codeInfoMap()} titles={titles} />
          </Suspense>
        </div>
        <PopularSidebar />
      </div>
    </PageFrame>
  );
}
