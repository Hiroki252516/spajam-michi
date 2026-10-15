import type { EventData, EventSearchResponse } from "./api";

export interface SearchProgress {
  phase: "discovering" | "routing" | "enriching" | "complete";
  processedCandidates: number;
  totalCandidates: number;
  reasonStatus: "pending" | "generating" | "completed" | "failed";
}

export interface SearchJob {
  jobId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  revision?: number;
  progress?: SearchProgress;
  events?: EventData[];
  meta?: EventSearchResponse["meta"];
  error?: { code?: string; message?: string };
}

export interface SearchUpdate extends EventSearchResponse {
  jobId: string;
  status: SearchJob["status"];
  revision: number;
  progress: SearchProgress;
}

export function abortSearchError() {
  const error = new Error("検索を中止しました。");
  error.name = "AbortError";
  return error;
}

function abortable<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(abortSearchError());
    signal.addEventListener("abort", abort, { once: true });
    task
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
    if (signal.aborted) abort();
  });
}

function delay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(abortSearchError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      signal.removeEventListener("abort", abort);
      abort();
    }
  });
}

export function mergeSearchEvents(previous: EventData[], next: EventData[]) {
  const incoming = new Map(next.map((event) => [event.id, event]));
  const merged: EventData[] = [];
  for (const event of previous) {
    const update = incoming.get(event.id);
    if (!update) continue;
    merged.push({
      ...event,
      ...update,
      coordinates:
        event.coordinates?.latitude === update.coordinates?.latitude &&
        event.coordinates?.longitude === update.coordinates?.longitude
          ? event.coordinates
          : update.coordinates,
    });
    incoming.delete(event.id);
  }
  return [...merged, ...incoming.values()];
}

/** Poll partial snapshots until routing and optional explanations finish. */
export async function pollSearchJob(input: {
  start: (signal: AbortSignal) => Promise<{ jobId: string; pollUrl: string }>;
  read: (url: string, signal: AbortSignal) => Promise<SearchJob>;
  signal?: AbortSignal;
  onProgress?: (update: SearchUpdate) => void;
  intervalMs?: number;
  timeoutMs?: number;
}): Promise<EventSearchResponse> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  input.signal?.addEventListener("abort", abort, { once: true });
  if (input.signal?.aborted) abort();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, input.timeoutMs ?? 135_000);
  const { signal } = controller;
  let latest: EventSearchResponse = {
    events: [],
    meta: { source: "database_fallback", degradedReasons: [] },
  };
  let revision = -1;
  let status: SearchJob["status"] | undefined;
  try {
    if (signal.aborted) throw abortSearchError();
    const accepted = await abortable(input.start(signal), signal);
    while (true) {
      await delay(input.intervalMs ?? 1_000, signal);
      const job = await abortable(input.read(accepted.pollUrl, signal), signal);
      if (signal.aborted) throw abortSearchError();
      if (job.jobId !== accepted.jobId)
        throw new Error("検索結果の識別情報が一致しません。");
      if (job.revision !== undefined && job.revision < revision) continue;
      if (
        job.revision === undefined ||
        job.revision > revision ||
        job.status !== status
      ) {
        revision = job.revision ?? revision + 1;
        status = job.status;
        if (job.events)
          latest = {
            events: mergeSearchEvents(latest.events, job.events),
            meta: job.meta ?? latest.meta,
          };
        const terminal = job.status === "succeeded" || job.status === "failed";
        input.onProgress?.({
          ...latest,
          jobId: job.jobId,
          status: job.status,
          revision,
          progress: job.progress ?? {
            phase: terminal ? "complete" : "routing",
            processedCandidates: 0,
            totalCandidates: 0,
            reasonStatus: terminal ? "completed" : "pending",
          },
        });
      }
      if (job.status === "succeeded") return latest;
      if (job.status === "failed")
        throw new Error(job.error?.message ?? "イベント検索に失敗しました。");
    }
  } catch (error) {
    if (timedOut)
      throw new Error(
        "イベント検索に時間がかかっています。取得済みの候補を確認するか、再検索してください。",
      );
    if (signal.aborted) throw abortSearchError();
    throw error;
  } finally {
    clearTimeout(timer);
    controller.abort();
    input.signal?.removeEventListener("abort", abort);
  }
}
