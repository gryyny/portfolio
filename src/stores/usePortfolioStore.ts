import { create } from "zustand";
import type { Phase } from "@/game/core";

// Presentation only: read-only snapshots of the game for React, plus UI toggles.
// The game core alone changes phase, version and rollbacks.

interface QuizView {
  topic: string;
  question: string;
  choices: string[];
  revealed: boolean;
  picked: string | null;
  right: string;
}

export interface Hud {
  phase: Phase;
  version: string;
  checks: string;
  rollbacks: number;
  quiz: QuizView | null;
}

export interface Result {
  version: string;
  releases: number;
  best: string;
  isBest: boolean;
}

interface PortfolioState {
  hud: Hud | null;
  result: Result | null;
  toast: { id: number; text: string } | null;
  promo: boolean;
  mailOpen: boolean;
  tiltOn: boolean;
  immersive: boolean;
  setHud: (hud: Hud) => void;
  setResult: (result: Result) => void;
  showToast: (text: string) => void;
  setPromo: (promo: boolean) => void;
  setMailOpen: (mailOpen: boolean) => void;
  setTiltOn: (tiltOn: boolean) => void;
  setImmersive: (immersive: boolean) => void;
}

export const usePortfolioStore = create<PortfolioState>()((set) => ({
  hud: null,
  result: null,
  toast: null,
  promo: false,
  mailOpen: false,
  tiltOn: false,
  immersive: false,
  setHud: (hud) => {
    set({ hud });
  },
  setResult: (result) => {
    set({ result });
  },
  showToast: (text) => {
    set((s) => ({ toast: { id: (s.toast?.id ?? 0) + 1, text } }));
  },
  setPromo: (promo) => {
    set({ promo });
  },
  setMailOpen: (mailOpen) => {
    set({ mailOpen });
  },
  setTiltOn: (tiltOn) => {
    set({ tiltOn });
  },
  setImmersive: (immersive) => {
    set({ immersive });
  },
}));
