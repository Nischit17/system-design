import type { Metadata } from "next";
import { ProfileView, type ProfileProblem } from "@/components/profile/ProfileView";
import { PageFrame } from "@/components/site/PageFrame";
import { PageHeading } from "@/components/site/PageHeading";
import { ALL_PROBLEMS } from "@/lib/content/registry";
import { TRACKS } from "@/lib/content/tracks";

export const metadata: Metadata = { title: "Your progress", robots: { index: false } };

const GROUP: Record<string, string> = {
  "compute-traffic-foundations": "Compute",
  "data-storage-foundations": "Data",
  "caching-delivery-foundations": "Caching",
  "events-communication-advanced": "Events",
  "service-resilience-advanced": "Resilience",
  "production-operations-advanced": "Operations",
  "expert-system-architecture": "Expert",
  "ml-data-foundations": "ML",
  "ml-training-foundations": "ML",
  "ml-serving-foundations": "ML",
  "llm-system-design": "LLM",
};

export default function ProfilePage() {
  const problems: ProfileProblem[] = ALL_PROBLEMS.map((p) => ({
    id: p.id,
    title: p.title,
    difficulty: p.difficulty,
    track: TRACKS.find((t) => t.slug === p.trackSlug)?.shortTitle ?? "",
    group: GROUP[p.trackSlug] ?? "Other",
  }));
  return (
    <PageFrame>
      <div className="relative mx-auto max-w-6xl px-5 pb-10 sm:px-10">
        <PageHeading eyebrow="Progress" title="Your progress" subtitle="Solved problems, streaks and skills, saved in this browser. No account needed." />
        <ProfileView problems={problems} />
      </div>
    </PageFrame>
  );
}
