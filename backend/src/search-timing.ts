import { performance } from "node:perf_hooks";

export const SEARCH_TIMING_STAGES = [
  "duckDuckGoSearch",
  "eventPageFetch",
  "gemmaAnalysis",
  "gsiGeocoding",
  "transitRouting",
  "ragRecommendation",
] as const;

export type SearchTimingStage = (typeof SEARCH_TIMING_STAGES)[number];
export type SearchTimingStatus =
  "completed" | "degraded" | "failed" | "skipped";

export type SearchTimingOperationSummary = {
  cumulativeMs: number;
  operations: number;
  succeeded: number;
  failed: number;
  averageMs: number;
  maxMs: number;
};

export type SearchTimingStageSummary = SearchTimingOperationSummary & {
  status: SearchTimingStatus;
  wallMs: number;
  skipReason?: string;
  breakdown: Record<string, SearchTimingOperationSummary>;
};

export type SearchDebugTimings = {
  version: 1;
  unit: "ms";
  totalMs: number;
  stages: Record<SearchTimingStage, SearchTimingStageSummary>;
};

type TimingRecord = {
  operation: string;
  startedAt: number;
  endedAt: number;
  succeeded: boolean;
};

type TimingLogger = (message: string) => void;

export class SearchTimingCollector {
  private readonly startedAt: number;
  private readonly records = new Map<SearchTimingStage, TimingRecord[]>();
  private readonly skipReasons = new Map<SearchTimingStage, string>();
  private readonly loggedStages = new Set<SearchTimingStage>();

  constructor(
    private readonly jobId: string,
    private readonly now: () => number = () => performance.now(),
    private readonly logger: TimingLogger = (message) => console.info(message),
  ) {
    this.startedAt = this.now();
  }

  async measure<T>(
    stage: SearchTimingStage,
    operation: string,
    task: () => Promise<T>,
  ): Promise<T> {
    const startedAt = this.now();
    try {
      const result = await task();
      this.record(stage, operation, startedAt, this.now(), true);
      return result;
    } catch (error) {
      this.record(stage, operation, startedAt, this.now(), false);
      throw error;
    }
  }

  skip(stage: SearchTimingStage, reason: string) {
    if ((this.records.get(stage)?.length ?? 0) === 0) {
      this.skipReasons.set(stage, reason);
    }
  }

  snapshot(): SearchDebugTimings {
    return {
      version: 1,
      unit: "ms",
      totalMs: milliseconds(this.now() - this.startedAt),
      stages: Object.fromEntries(
        SEARCH_TIMING_STAGES.map((stage) => [stage, this.stageSummary(stage)]),
      ) as Record<SearchTimingStage, SearchTimingStageSummary>,
    };
  }

  logStages(stages: SearchTimingStage[]) {
    const snapshot = this.snapshot();
    for (const stage of stages) {
      if (this.loggedStages.has(stage)) continue;
      this.loggedStages.add(stage);
      this.logger(
        JSON.stringify({
          event: "event_search_stage_timing",
          jobId: this.jobId,
          stage,
          timing: snapshot.stages[stage],
        }),
      );
    }
  }

  logSummary(status: "succeeded" | "failed", timings: SearchDebugTimings) {
    this.logger(
      JSON.stringify({
        event: "event_search_timing_summary",
        jobId: this.jobId,
        status,
        timings,
      }),
    );
  }

  private record(
    stage: SearchTimingStage,
    operation: string,
    startedAt: number,
    endedAt: number,
    succeeded: boolean,
  ) {
    const records = this.records.get(stage) ?? [];
    records.push({ operation, startedAt, endedAt, succeeded });
    this.records.set(stage, records);
    this.skipReasons.delete(stage);
  }

  private stageSummary(stage: SearchTimingStage): SearchTimingStageSummary {
    const records = this.records.get(stage) ?? [];
    if (records.length === 0) {
      return {
        status: "skipped",
        wallMs: 0,
        cumulativeMs: 0,
        operations: 0,
        succeeded: 0,
        failed: 0,
        averageMs: 0,
        maxMs: 0,
        ...(this.skipReasons.has(stage)
          ? { skipReason: this.skipReasons.get(stage)! }
          : {}),
        breakdown: {},
      };
    }
    const aggregate = summarizeRecords(records);
    const failed = records.filter((record) => !record.succeeded).length;
    const grouped = new Map<string, TimingRecord[]>();
    for (const record of records) {
      const operationRecords = grouped.get(record.operation) ?? [];
      operationRecords.push(record);
      grouped.set(record.operation, operationRecords);
    }
    const breakdown = Object.fromEntries(
      [...grouped].map(([operation, operationRecords]) => [
        operation,
        summarizeRecords(operationRecords),
      ]),
    );
    return {
      status:
        failed === records.length
          ? "failed"
          : failed > 0
            ? "degraded"
            : "completed",
      wallMs: milliseconds(unionDuration(records)),
      ...aggregate,
      breakdown,
    };
  }
}

export function measureSearchTiming<T>(
  collector: SearchTimingCollector | undefined,
  stage: SearchTimingStage,
  operation: string,
  task: () => Promise<T>,
) {
  return collector ? collector.measure(stage, operation, task) : task();
}

function summarizeRecords(
  records: TimingRecord[],
): SearchTimingOperationSummary {
  const durations = records.map(({ startedAt, endedAt }) =>
    Math.max(0, endedAt - startedAt),
  );
  const cumulative = durations.reduce((sum, duration) => sum + duration, 0);
  const succeeded = records.filter((record) => record.succeeded).length;
  return {
    cumulativeMs: milliseconds(cumulative),
    operations: records.length,
    succeeded,
    failed: records.length - succeeded,
    averageMs: milliseconds(cumulative / records.length),
    maxMs: milliseconds(Math.max(...durations)),
  };
}

function unionDuration(records: TimingRecord[]) {
  const intervals = records
    .map(({ startedAt, endedAt }) => ({
      start: Math.min(startedAt, endedAt),
      end: Math.max(startedAt, endedAt),
    }))
    .sort((left, right) => left.start - right.start);
  let total = 0;
  let currentStart = intervals[0]!.start;
  let currentEnd = intervals[0]!.end;
  for (const interval of intervals.slice(1)) {
    if (interval.start <= currentEnd) {
      currentEnd = Math.max(currentEnd, interval.end);
      continue;
    }
    total += currentEnd - currentStart;
    currentStart = interval.start;
    currentEnd = interval.end;
  }
  return total + currentEnd - currentStart;
}

function milliseconds(value: number) {
  return Math.round(Math.max(0, value) * 1000) / 1000;
}
