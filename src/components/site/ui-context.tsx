"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { AppTour } from "./AppTour";

interface UIContextValue {
  startTour: () => void;
}

const UIContext = createContext<UIContextValue | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [tourOpen, setTourOpen] = useState(false);
  const value = useMemo<UIContextValue>(() => ({ startTour: () => setTourOpen(true) }), []);
  return (
    <UIContext.Provider value={value}>
      {children}
      {tourOpen && <AppTour onClose={() => setTourOpen(false)} />}
    </UIContext.Provider>
  );
}

export function useUI(): UIContextValue {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error("useUI must be used inside UIProvider");
  return ctx;
}
