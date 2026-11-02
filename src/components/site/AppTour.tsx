"use client";

import { SITE } from "@/lib/site";
import { SpotlightTour, type TourStep } from "./SpotlightTour";

const STEPS: TourStep[] = [
  {
    target: "onboarding-logo",
    title: `Welcome to ${SITE.name}`,
    description: "This is a quick tour of the app shell so you know where everything lives. Use Next/Back or the arrow keys, or skip anytime.",
  },
  {
    target: "onboarding-nav",
    title: "Problems, Roadmaps, Learning",
    description: "Practice standalone problems, follow a structured roadmap, or work through the learning content behind each topic.",
  },
  {
    target: "onboarding-progress",
    title: "Your progress",
    description: "Solved problems, streaks and lists are saved in this browser. No account or sign-in needed; open this menu for your activity and skill breakdown.",
  },
];

export function AppTour({ onClose }: { onClose: () => void }) {
  return <SpotlightTour label="Quick tour" steps={STEPS} onClose={onClose} />;
}
