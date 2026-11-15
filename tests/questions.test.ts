import { describe, expect, it } from "vitest";
import bank from "@/content/questions.json";

const topics = new Set(["JS", "TS", "React", "Git", "HTTP", "SQL", "Web3", "Ops", "CS", "AI"]);

// Format only. Each right answer is checked against official docs when a batch is reviewed.
describe("question bank", () => {
  it.each(bank.map((q) => [q.question, q] as const))("%s", (_, q) => {
    expect(Object.keys(q).sort()).toEqual(["question", "right", "topic", "wrong"]);
    expect(topics.has(q.topic)).toBe(true);
    expect(q.question.length).toBeLessThanOrEqual(48);
    expect(q.wrong).toHaveLength(2);
    const answers = [q.right, ...q.wrong];
    for (const a of answers) {
      expect(a.trim()).not.toBe("");
      expect(a.length).toBeLessThanOrEqual(28);
    }
    expect(new Set(answers).size).toBe(3);
  });

  it("has unique questions", () => {
    expect(new Set(bank.map((q) => q.question)).size).toBe(bank.length);
  });
});
