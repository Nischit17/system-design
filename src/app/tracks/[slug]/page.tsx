import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageFrame } from "@/components/site/PageFrame";
import { TrackRoadmap } from "@/components/tracks/TrackRoadmap";
import { codeInfoMap } from "@/lib/content/roadmap-data";
import { TRACKS, getTrack } from "@/lib/content/tracks";

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return TRACKS.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const track = getTrack(slug);
  return track ? { title: track.title, description: track.description } : { title: "Page not found" };
}

export default async function TrackPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const track = getTrack(slug);
  if (!track) notFound();
  const backHref = track.family === "software-system-design" ? "/roadmaps?family=software-system-design" : `/roadmaps?family=${track.family}`;
  return (
    <PageFrame>
      <TrackRoadmap track={track} codes={codeInfoMap()} backHref={backHref} />
    </PageFrame>
  );
}
