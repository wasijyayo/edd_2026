export interface Concept {
  conceptId: string;
  label?: string;
  status: "confirmed" | "learning" | "unobserved";
  score: number;
  evidence: { solvedIndependentlyCount: number; hintUsedCount: number };
}

export function summarizeConcepts(concepts: readonly Concept[]) {
  return concepts.reduce(
    (summary, concept) => ({ ...summary, [concept.status]: summary[concept.status] + 1 }),
    { confirmed: 0, learning: 0, unobserved: 0 },
  );
}
