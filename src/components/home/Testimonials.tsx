import { Code2, LineChart, Quote, UserRound, type LucideIcon } from "lucide-react";
import { Reveal } from "@/components/motion/Reveal";

/**
 * Sample testimonials. Replace with real quotes (and only real quotes) from your users.
 */
const TESTIMONIALS: { role: string; quote: string; icon: LucideIcon }[] = [
  {
    role: "Backend Engineer",
    icon: Code2,
    quote: "Building the architecture and watching it fail the load test taught me more than a week of reading. It finally clicked why headroom matters.",
  },
  {
    role: "Data Scientist",
    icon: LineChart,
    quote: "Feels like a practice ground for system design interviews where the feedback is actual numbers, not vibes.",
  },
  {
    role: "Learner",
    icon: UserRound,
    quote: "I used it to prepare for high-level design rounds and the fix-the-broken-system problems were the most useful part.",
  },
];

export function Testimonials() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24">
      <Reveal className="max-w-3xl">
        <p className="figures text-xs uppercase tracking-[0.12em] text-accent">From the field</p>
        <h2 className="mt-4 text-4xl font-semibold tracking-[-0.035em] text-text-primary sm:text-5xl">Feedback measured in numbers.</h2>
      </Reveal>
      <Reveal className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3" stagger={0.1}>
        {TESTIMONIALS.map((t) => (
          <figure key={t.role} className="relative flex flex-col justify-between gap-8 overflow-hidden rounded-2xl border border-border bg-surface/70 p-7">
            <Quote className="absolute right-6 top-6 h-10 w-10 text-accent/15" aria-hidden="true" />
            <blockquote className="relative text-[15px] leading-relaxed text-text-secondary">&ldquo;{t.quote}&rdquo;</blockquote>
            <figcaption className="flex items-center gap-3 border-t border-border pt-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-accent/30 bg-accent/10">
                <t.icon className="h-[18px] w-[18px] text-accent" aria-hidden="true" />
              </span>
              <span className="text-sm font-semibold text-text-primary">{t.role}</span>
            </figcaption>
          </figure>
        ))}
      </Reveal>
    </section>
  );
}
