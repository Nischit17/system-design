import type { Metadata } from "next";
import { Suspense } from "react";
import { LearningHub } from "@/components/learning/LearningHub";
import { PageFrame } from "@/components/site/PageFrame";
import { HeadingStats, PageHeading } from "@/components/site/PageHeading";
import { guideStats } from "@/lib/content/learning";
import { TRACKS } from "@/lib/content/tracks";

export const metadata: Metadata = {
  title: "Learning",
  description: "Long-form guides behind every roadmap section: capacity planning, databases, caching, events, resilience, ML and LLM systems.",
};

export default function LearningPage() {
  const tracks = TRACKS.filter((t) => t.slug !== "expert-system-architecture");
  const stats = Object.fromEntries(tracks.flatMap((t) => t.sections.map((s) => [s.id, guideStats(s.id)])));
  return (
    <PageFrame>
      <div className="relative mx-auto max-w-6xl px-5 pb-10 sm:px-10">
        <PageHeading
          eyebrow="Learning"
          title="The reading behind every roadmap"
          subtitle="Long-form guides with diagrams and interactive calculators. Read in light or dark, then put each chapter to work in the labs."
          aside={
            <HeadingStats
              items={[
                { label: "Guides", value: Object.keys(stats).length },
                { label: "Chapters", value: Object.values(stats).reduce((n, s) => n + s.chapters, 0) },
              ]}
            />
          }
        />
        <Suspense>
          <LearningHub tracks={tracks} stats={stats} />
        </Suspense>
      </div>
    </PageFrame>
  );
}
