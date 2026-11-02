import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy Policy" };

const N = SITE.name;

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="November 2, 2026"
      summary={`${N} has no accounts and no tracking. Your progress stays in your browser; the only thing that reaches us is a message you choose to send.`}
      sections={[
        { title: "What this covers", paragraphs: [`This policy explains what ${N} ("we", "us") stores when you use the site, where it is kept, and how you can see or delete it.`] },
        {
          title: "No accounts",
          paragraphs: [
            "There is no sign-up and no sign-in. We never ask for your name, email address or password to use any part of the site, and we don't build a profile of you.",
          ],
        },
        {
          title: "What stays in your browser",
          paragraphs: ["Everything that makes progress work is kept in your browser's local storage on your device, and is not sent to us:"],
          bullets: [
            "Problems you open, submissions, best scores and completion dates.",
            "Canvas drafts, so a design survives a page reload.",
            "Lists you create, and your activity heatmap and streaks.",
            "Simple preferences, such as the light or dark theme for learning guides.",
          ],
          after: ["Because it lives on your device, clearing your browser's site data removes it. You can export it to a file, import it elsewhere, or reset it from the progress page."],
        },
        {
          title: "Messages you send",
          paragraphs: [
            "If you use the Contact page, we receive the subject and message, plus a name and email address only if you choose to add them so we can reply. We use them only to answer you.",
          ],
        },
        { title: "Technical data", paragraphs: ["Like any website, the server that delivers pages may keep short-lived request logs (such as IP address and browser type) to keep the service running and to stop abuse. We don't use them to identify or follow you."] },
        { title: "Cookies and tracking", paragraphs: ["We don't use advertising or analytics cookies, and we don't sell or share personal data."] },
        { title: "How long we keep it", paragraphs: ["Contact messages are kept only as long as needed to handle them. Data in your browser stays until you or your browser remove it."] },
        { title: "Children's privacy", paragraphs: ["The service is not directed at children under 13, and we do not knowingly collect their personal data."] },
        { title: "Changes to this policy", paragraphs: ["If this policy changes in a meaningful way we will update the date above."] },
        { title: "Contact", paragraphs: ["Privacy questions can be sent through the Contact page."] },
      ]}
    />
  );
}
