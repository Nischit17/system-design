import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SITE } from "@/lib/site";
import { Providers } from "./providers";
import "./globals.css";

// Self-hosted (OFL) font files: no network needed at build or dev time.
// Manrope for every piece of UI text; JetBrains Mono only for code and formulas.
const manrope = localFont({
  src: [
    { path: "./fonts/manrope-latin-wght-normal.woff2", weight: "200 800" },
    { path: "./fonts/manrope-latin-ext-wght-normal.woff2", weight: "200 800" },
  ],
  variable: "--font-manrope",
  display: "swap",
});
const jetbrainsMono = localFont({
  src: [
    { path: "./fonts/jetbrains-mono-latin-wght-normal.woff2", weight: "100 800" },
    { path: "./fonts/jetbrains-mono-latin-ext-wght-normal.woff2", weight: "100 800" },
  ],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const title = `${SITE.name} | ${SITE.tagline}`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: title, template: `%s | ${SITE.name}` },
  description: SITE.description,
  openGraph: { title, description: SITE.description, type: "website", siteName: SITE.name },
  twitter: { card: "summary_large_image", title, description: SITE.description },
};

export const viewport: Viewport = {
  themeColor: "#07080c",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${manrope.variable} ${jetbrainsMono.variable} ops-theme h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col bg-background text-text-primary">
        <Providers>
          <div className="flex min-h-full flex-1 flex-col motion-safe:animate-[route-settle-in_320ms_var(--ease-spring-interactive)_both]">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
