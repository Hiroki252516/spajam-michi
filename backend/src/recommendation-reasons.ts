import { z } from "zod";

import {
  isCleanRecommendationReason,
  REASON_TEXT_PATTERN,
} from "./llm-output.js";
import { OllamaClient, OllamaOutputError } from "./ollama.js";
import type { TravelMode } from "./transit.js";

export type ReasonCandidate = {
  eventId: string;
  description: string;
  travelMinutes: number;
  travelMode: TravelMode;
  preferenceScore: number;
};

/** Bound both the request size and total time spent on optional explanations. */
export async function generateRecommendationReasons(input: {
  ollama: OllamaClient;
  candidates: ReasonCandidate[];
  preferenceKeywords: string[];
  signal?: AbortSignal;
  onFailure: (error: unknown) => void;
}) {
  const reasons = new Map<string, string>();
  if (!input.candidates.length) return reasons;
  const signal = AbortSignal.any([
    ...(input.signal ? [input.signal] : []),
    AbortSignal.timeout(15_000),
  ]);
  for (let start = 0; start < input.candidates.length; start += 3) {
    if (signal.aborted) {
      input.onFailure(signal.reason);
      break;
    }
    const batch = input.candidates.slice(start, start + 3);
    const reason = z.string().min(1).max(120).regex(REASON_TEXT_PATTERN);
    const parser = z
      .object({
        reasons: z
          .object(
            Object.fromEntries(batch.map((event) => [event.eventId, reason])),
          )
          .strict(),
      })
      .strict();
    try {
      const result = await input.ollama.json(
        {
          system:
            "各候補の移動時間と嗜好タグを根拠に、日本語で短い推薦理由を1文ずつ作成してください。入力にない料金・開催日時・事実は追加しないでください。イベント名を公開しないでください。reasonsはイベントIDをキー、推薦理由を値とするオブジェクトです。理由の文にコード、JSON、Markdown、繰り返しは含めないでください。",
          user: JSON.stringify({
            preferenceKeywords: input.preferenceKeywords.slice(0, 6),
            events: batch.map((event) => ({
              ...event,
              description: event.description.slice(0, 240),
            })),
          }),
          maxOutputTokens: 128 + batch.length * 128,
        },
        parser,
        signal,
      );
      for (const candidate of batch) {
        const text = result.reasons[candidate.eventId]!;
        if (isCleanRecommendationReason(text))
          reasons.set(candidate.eventId, text.trim());
        else input.onFailure(new OllamaOutputError("invalid_text"));
      }
    } catch (error) {
      input.onFailure(error);
    }
  }
  return reasons;
}
