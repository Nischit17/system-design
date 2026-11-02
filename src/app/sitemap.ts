import type { MetadataRoute } from "next";
import { ALL_PROBLEMS } from "@/lib/content/registry";
import { TRACKS } from "@/lib/content/tracks";
import { SITE } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = SITE.url;
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/problems`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/roadmaps`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/learning`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    ...ALL_PROBLEMS.map((p) => ({ url: `${base}/problems/${p.id}`, changeFrequency: "monthly" as const, priority: 0.7 })),
    ...TRACKS.map((t) => ({ url: `${base}/tracks/${t.slug}`, changeFrequency: "monthly" as const, priority: 0.6 })),
    ...TRACKS.flatMap((t) => t.sections.map((s) => ({ url: `${base}/tracks/${t.slug}/sections/${s.id}`, changeFrequency: "monthly" as const, priority: 0.5 }))),
  ];
}
