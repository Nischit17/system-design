import type { Metadata } from "next";
import { AboutTabs } from "@/components/about/AboutTabs";
import { PageFrame } from "@/components/site/PageFrame";
import { PageHeading } from "@/components/site/PageHeading";
import { TOTAL_PROBLEM_COUNT } from "@/lib/content/registry";
import { SITE } from "@/lib/site";
import { TRACKS } from "@/lib/content/tracks";

export const metadata: Metadata = { title: "About", description: "Why this platform exists and how its simulator grades system designs." };

export default function AboutPage() {
  return (
    <PageFrame>
      <div className="relative mx-auto max-w-7xl px-5 pb-20 sm:px-10">
        <PageHeading
          eyebrow="About"
          title={`Why ${SITE.name} exists`}
          subtitle="System design practice where the diagram is executed, not admired. Free for everyone, open source, and no account needed."
        />
        <AboutTabs problemCount={TOTAL_PROBLEM_COUNT} trackCount={TRACKS.length} />
      </div>
    </PageFrame>
  );
}
