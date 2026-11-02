import { FinalCta } from "@/components/home/FinalCta";
import { HomeHero } from "@/components/home/HomeHero";
import { StoryScroll } from "@/components/home/StoryScroll";
import { TermsMarquee } from "@/components/home/TermsMarquee";
import { Testimonials } from "@/components/home/Testimonials";
import { TrackShowcase } from "@/components/home/TrackShowcase";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SmoothScroll } from "@/components/site/SmoothScroll";
import { COMPONENTS } from "@/lib/catalog/components";
import { TOTAL_PROBLEM_COUNT } from "@/lib/content/registry";
import { TRACKS } from "@/lib/content/tracks";

export default function HomePage() {
  return (
    <main className="bg-background">
      <SmoothScroll />
      <HomeHero header={<SiteHeader />} stats={{ problems: TOTAL_PROBLEM_COUNT, tracks: TRACKS.length, components: COMPONENTS.length }} />
      <TermsMarquee />
      <StoryScroll />
      <TrackShowcase />
      <Testimonials />
      <FinalCta />
      <SiteFooter />
    </main>
  );
}
