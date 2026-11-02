import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Workspace } from "@/components/workspace/Workspace";
import { ALL_PROBLEMS, getProblem } from "@/lib/content/registry";

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return ALL_PROBLEMS.map((p) => ({ slug: p.id }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const problem = getProblem(slug);
  if (!problem) return { title: "Page not found" };
  return { title: problem.title, description: problem.description.slice(0, 155) };
}

export default async function ProblemPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const problem = getProblem(slug);
  if (!problem || problem.id !== slug) notFound();
  return (
    <Suspense>
      <Workspace problemId={problem.id} />
    </Suspense>
  );
}
