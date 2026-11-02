import type { Metadata } from "next";
import { ContactForm } from "@/components/site/ContactForm";
import { PageFrame } from "@/components/site/PageFrame";
import { PageHeading } from "@/components/site/PageHeading";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <PageFrame>
      <div className="relative mx-auto max-w-6xl px-5 pb-10 sm:px-10">
        <PageHeading eyebrow="Contact" title="Get in touch" subtitle="Questions, bugs, or feedback on a problem or guide: we read everything." />
        <ContactForm />
      </div>
    </PageFrame>
  );
}
