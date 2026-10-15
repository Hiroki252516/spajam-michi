export type SearchProgress = {
  phase: "discovering" | "routing" | "enriching" | "complete";
  processedCandidates: number;
  totalCandidates: number;
  reasonStatus: "pending" | "generating" | "completed" | "failed";
};

export function initialSearchProgress(): SearchProgress {
  return {
    phase: "discovering",
    processedCandidates: 0,
    totalCandidates: 0,
    reasonStatus: "pending",
  };
}
