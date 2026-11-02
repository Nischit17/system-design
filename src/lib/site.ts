/** Brand + global settings. Rebrand the whole app by editing this file. */
export const SITE = {
  name: "Loadline",
  shortName: "Loadline",
  tagline: "Know what your design can carry",
  description:
    "Free, open-source system design practice: build architectures on a canvas that a capacity simulator load-tests for real. Problems, roadmaps and guides covering scalability, databases, caching, distributed systems, ML and LLM systems.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  copyrightYear: 2026,
} as const;

export const PRIMARY_NAV = [
  { href: "/problems", label: "Problems" },
  { href: "/roadmaps", label: "Roadmaps" },
  { href: "/learning", label: "Learning" },
  { href: "/about", label: "About" },
] as const;

export const FOOTER_LINKS = [
  { href: "/about", label: "About" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/contact", label: "Contact" },
] as const;

export function pageTitle(title?: string): string {
  return title ? `${title} | ${SITE.name}` : `${SITE.name} | ${SITE.tagline}`;
}
