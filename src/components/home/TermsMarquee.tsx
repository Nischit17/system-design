const TERMS = [
  "Load balancers",
  "Read replicas",
  "Consistent hashing",
  "Circuit breakers",
  "Backpressure",
  "Rate limiting",
  "Edge caching",
  "Idempotency keys",
  "Autoscaling",
  "Sharding",
  "Event streams",
  "Feature stores",
  "Vector search",
  "Failover",
];

/** Slow-moving band of system design vocabulary between hero and story. */
export function TermsMarquee() {
  return (
    <div aria-hidden="true" className="relative overflow-hidden border-y border-border bg-background-elevated/60 py-4">
      <div className="flex w-max gap-10 whitespace-nowrap figures text-xs uppercase tracking-[0.12em] text-text-muted motion-safe:animate-[marquee-x_48s_linear_infinite]">
        {[...TERMS, ...TERMS].map((t, i) => (
          <span key={`${t}-${i}`} className="flex items-center gap-10">
            {t}
            <span className="h-1 w-1 rounded-full bg-accent/60" />
          </span>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-background to-transparent" />
    </div>
  );
}
