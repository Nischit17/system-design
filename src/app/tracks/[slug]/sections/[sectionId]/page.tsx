import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuideView } from "@/components/learning/GuideView";
import { GUIDE_THEME_SCRIPT } from "@/components/learning/guide-theme-script";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { getGuide } from "@/lib/content/learning";
import { codeInfoMap } from "@/lib/content/roadmap-data";
import { TRACKS } from "@/lib/content/tracks";

type Params = { slug: string; sectionId: string };

export function generateStaticParams(): Params[] {
  return TRACKS.flatMap((t) => t.sections.map((s) => ({ slug: t.slug, sectionId: s.id })));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { sectionId } = await params;
  const g = getGuide(sectionId);
  return g ? { title: g.guide.title, description: g.guide.intro } : { title: "Page not found" };
}

const FAMILY_LABEL: Record<string, string> = {
  "software-system-design": "Software System Architecture",
  "ml-ai-system-design": "ML & AI System Design",
  "llm-genai-systems": "LLM & GenAI Systems",
};

export default async function GuidePage({ params }: { params: Promise<Params> }) {
  const { slug, sectionId } = await params;
  const g = getGuide(sectionId);
  if (!g || g.track.slug !== slug) notFound();
  const codes = codeInfoMap();
  const labs = g.section.codes.flatMap((c) => (codes[c] ? [codes[c]] : []));
  return (
    <div className="guide-theme flex min-h-full flex-1 flex-col">
      <script dangerouslySetInnerHTML={{ __html: GUIDE_THEME_SCRIPT }} />
      <div className="[&>header]:mb-0">
        <SiteHeader />
      </div>
      <GuideView
        guide={g.guide}
        sectionNumber={g.section.number}
        backHref={`/tracks/${g.track.slug}`}
        backLabel={FAMILY_LABEL[g.track.family] ?? g.track.title}
        labs={labs}
      />
      <SiteFooter />
    </div>
  );
}
