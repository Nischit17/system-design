"use client";

import { useState } from "react";
import { AlertCircle, Bug, CheckCircle2, Lightbulb, MessageSquareText, Send } from "lucide-react";
import { ui } from "@/components/ui/styles";

const TOPICS = [
  { icon: Bug, title: "A grader got it wrong", text: "Name the problem code (like SSA0004), what you built, and the score you expected." },
  { icon: Lightbulb, title: "Ideas for problems", text: "Systems you'd like to practise, or a failure drill that would teach something new." },
  { icon: MessageSquareText, title: "Guides and wording", text: "Anything unclear, out of date, or missing from a learning guide." },
];

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message, website }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Something went wrong.");
      setState("sent");
      setSubject("");
      setMessage("");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <form onSubmit={submit} className={`${ui.card} space-y-5 p-5 sm:p-8`}>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold text-text-secondary">
              Name <span className="font-normal text-text-muted">(optional)</span>
            </span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" placeholder="How should we greet you?" className={`${ui.input} mt-1.5`} />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-text-secondary">
              Email <span className="font-normal text-text-muted">(optional, for a reply)</span>
            </span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={160} autoComplete="email" placeholder="you@example.com" className={`${ui.input} mt-1.5`} />
          </label>
        </div>
        <label className="block">
          <span className="text-xs font-semibold text-text-secondary">Subject</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} required maxLength={140} placeholder="What's this about?" className={`${ui.input} mt-1.5`} />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-text-secondary">Message</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            minLength={10}
            maxLength={5000}
            rows={7}
            placeholder="Tell us what's going on…"
            className={`${ui.input} mt-1.5 resize-y`}
          />
        </label>
        <label aria-hidden="true" className="hidden">
          Website
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
        {state === "sent" && (
          <p className="flex items-center gap-2 rounded-xl border border-success/40 bg-success/10 px-3.5 py-3 text-sm text-success motion-safe:animate-[roadmap-pop-in_240ms_var(--ease-spring-interactive)_both]">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            Thanks, your message was sent{email ? `. We'll reply to ${email}.` : "."}
          </p>
        )}
        {state === "error" && (
          <p className="flex items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-3 text-sm text-danger">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
          <p className="text-xs text-text-muted">No account needed. We only use your email to reply.</p>
          <button type="submit" disabled={state === "sending"} className={ui.btnPrimary}>
            <Send className="h-4 w-4" aria-hidden="true" />
            {state === "sending" ? "Sending…" : "Send message"}
          </button>
        </div>
      </form>
      <aside className="space-y-3">
        <p className={`${ui.label} px-1`}>Helpful to include</p>
        {TOPICS.map((t) => (
          <div key={t.title} className={`${ui.card} flex gap-3 p-4`}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <t.icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">{t.title}</h3>
              <p className="mt-1 text-[13px] leading-5 text-text-muted">{t.text}</p>
            </div>
          </div>
        ))}
      </aside>
    </div>
  );
}
