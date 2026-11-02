import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

/**
 * Stores contact messages as JSON lines in ./data/contact-messages.jsonl.
 * Loadline has no accounts, so anyone can write in; a reply address is optional.
 * Swap the file write for your email provider or ticketing system in production.
 */

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const recent = new Map<string, number[]>();

function limited(ip: string): boolean {
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  recent.set(ip, hits);
  return hits.length > MAX_PER_WINDOW;
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limited(ip)) return NextResponse.json({ error: "Too many messages. Try again in a few minutes." }, { status: 429 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  // hidden field real people never fill in
  if (text(body?.website, 200)) return NextResponse.json({ ok: true });

  const name = text(body?.name, 80);
  const email = text(body?.email, 160);
  const subject = text(body?.subject, 140);
  const message = text(body?.message, 5000);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "That email address doesn't look right." }, { status: 400 });
  if (!subject || message.length < 10) return NextResponse.json({ error: "Add a subject and a message of at least 10 characters." }, { status: 400 });

  const record = { at: new Date().toISOString(), name: name || null, email: email || null, subject, message };
  try {
    const dir = path.join(process.cwd(), "data");
    await mkdir(dir, { recursive: true });
    await appendFile(path.join(dir, "contact-messages.jsonl"), `${JSON.stringify(record)}\n`, "utf8");
  } catch {
    // read-only filesystems (serverless): fall back to the server log
    console.info("[contact]", record);
  }
  return NextResponse.json({ ok: true });
}
