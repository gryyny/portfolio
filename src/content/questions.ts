import type { Question } from "@/game/core";
import bank from "./questions.json";

// You are so sweet, hacker. Mommy's hacker. Yes, every right answer is sitting right here
// in questions.json, under "right". Reading the source counts as studying. We won't tell.

// JSON imports widen the two-item tuple to an array; tests/questions.test.ts enforces the shape.
export const questions: readonly Question[] = bank.map(
  ({ wrong: [first = "", second = ""], ...q }) => ({
    ...q,
    wrong: [first, second],
  }),
);
