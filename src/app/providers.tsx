"use client";

import type { ReactNode } from "react";
import { UIProvider } from "@/components/site/ui-context";

export function Providers({ children }: { children: ReactNode }) {
  return <UIProvider>{children}</UIProvider>;
}
