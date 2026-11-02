import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Terms of Service" };

const N = SITE.name;

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="November 2, 2026"
      summary={`${N} is free and open source. These terms are short because there is no account, no plan and nothing to buy.`}
      sections={[
        { title: "Agreement", paragraphs: [`These terms apply whenever you use ${N} ("we", "us"). Using the site means you accept them. If you do not accept them, please do not use the service.`] },
        {
          title: "The service",
          paragraphs: [
            `${N} is a learning platform for practising system design through interactive problems, roadmaps and guides. It is free for everyone, with no paid plans, trials or features held back. Features may change as the project evolves.`,
          ],
        },
        {
          title: "No accounts",
          paragraphs: ["You don't need an account to use any feature. Your progress is stored in your own browser, so you are in control of it: you can export, import or reset it at any time from the progress page."],
        },
        {
          title: "Acceptable use",
          paragraphs: ["When using the service you agree not to:"],
          bullets: [
            "Use the platform to attack or probe other systems.",
            "Disrupt the service or other people's use of it, including flooding the contact form.",
            "Present the content as your own commercial product in a way that breaks its open-source license.",
          ],
        },
        {
          title: "Open source",
          paragraphs: [
            `The simulator, problems and guides are open source. You may use, study and adapt them under the terms of the license published with the source code. Designs you create on the canvas are yours.`,
          ],
        },
        {
          title: "Disclaimer",
          paragraphs: [
            "The service is provided as is. Simulation results are educational approximations of real systems and are not a guarantee of how any production architecture will behave.",
          ],
        },
        {
          title: "Limitation of liability",
          paragraphs: ["To the extent allowed by law, we are not liable for indirect or consequential losses arising from your use of the service, including loss of progress stored in your browser."],
        },
        { title: "Changes to these terms", paragraphs: ["If these terms change in a meaningful way we will update the date above."] },
        { title: "Contact", paragraphs: ["Questions about these terms can be sent through the Contact page."] },
      ]}
    />
  );
}
