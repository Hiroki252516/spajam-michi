import { z } from "zod";

import type { WebSearchResult } from "./duckduckgo.js";
import { hasCleanModelFields } from "./llm-output.js";
import {
  measureSearchTiming,
  type SearchTimingCollector,
} from "./search-timing.js";

type OllamaMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: OllamaToolCall[];
};

type OllamaToolCall = {
  function: { name: string; arguments: unknown };
};

type OllamaChatResponse = {
  message?: OllamaMessage;
  done?: boolean;
  done_reason?: string;
};

export class OllamaOutputError extends Error {
  constructor(
    readonly reason:
      "output_limit" | "invalid_json" | "invalid_structure" | "invalid_text",
  ) {
    super(`Ollama structured output rejected: ${reason}`);
    this.name = "OllamaOutputError";
  }
}

export function ollamaFailureReason(error: unknown, signal?: AbortSignal) {
  if (error instanceof OllamaOutputError) return `ollama_${error.reason}`;
  if (signal?.aborted) return "event_discovery_timeout";
  if (error instanceof Error && error.name === "TimeoutError")
    return "ollama_request_timeout";
  return "ollama_request_unavailable";
}

const searchArgumentsSchema = z.object({ query: z.string().min(1).max(160) });

export class OllamaClient {
  constructor(
    readonly baseUrl: string,
    readonly chatModel: string,
    readonly embeddingModel: string,
    private readonly fetchImplementation: typeof fetch = fetch,
    private readonly requestTimeoutMs = 15_000,
  ) {
    assertLocalOllamaUrl(baseUrl);
  }

  async embed(texts: string[], signal?: AbortSignal) {
    if (texts.length === 0) return [];
    const response = await this.request<{ embeddings?: number[][] }>(
      "/api/embed",
      {
        model: this.embeddingModel,
        input: texts.map((text) => text.slice(0, 8_000)),
        truncate: true,
        keep_alive: "10m",
      },
      signal,
    );
    if (!response.embeddings || response.embeddings.length !== texts.length) {
      throw new Error("Ollama returned an invalid embedding response");
    }
    for (const embedding of response.embeddings) {
      if (
        embedding.length !== 768 ||
        embedding.some((value) => !Number.isFinite(value))
      ) {
        throw new Error("EmbeddingGemma must return 768-dimensional vectors");
      }
    }
    return response.embeddings;
  }

  async searchWithTool(
    input: {
      area: string;
      date: string;
      query: string;
      preferenceKeywords: string[];
    },
    executeSearch: (
      query: string,
      signal?: AbortSignal,
    ) => Promise<WebSearchResult[]>,
    signal?: AbortSignal,
    timings?: SearchTimingCollector,
  ) {
    const messages: OllamaMessage[] = [
      {
        role: "system",
        content:
          "あなたは日本のイベント検索担当です。与えられた地域・日付・関心語だけを使い、search_eventsツールを必ず呼び出してください。個人名や連絡先を検索語に含めてはいけません。ツール呼び出しは最大3回です。",
      },
      {
        role: "user",
        content: JSON.stringify(input),
      },
    ];
    const collected: WebSearchResult[] = [];
    let remainingCalls = 3;
    for (let turn = 0; turn < 3 && remainingCalls > 0; turn += 1) {
      const response = await measureSearchTiming(
        timings,
        "gemmaAnalysis",
        "searchToolPlanning",
        () =>
          this.chat(
            {
              messages,
              tools: [
                {
                  type: "function",
                  function: {
                    name: "search_events",
                    description:
                      "DuckDuckGoで一般公開されているイベントページを検索する",
                    parameters: z.toJSONSchema(searchArgumentsSchema, {
                      target: "draft-7",
                    }),
                  },
                },
              ],
            },
            signal,
            256,
          ),
      );
      const message = response.message;
      if (!message) throw new Error("Ollama returned no chat message");
      messages.push(message);
      const calls = message.tool_calls ?? [];
      if (calls.length === 0) break;
      for (const call of calls) {
        if (remainingCalls === 0) break;
        remainingCalls -= 1;
        if (call.function.name !== "search_events") {
          messages.push({
            role: "tool",
            content: JSON.stringify({ error: "unknown tool" }),
          });
          continue;
        }
        const parsed = searchArgumentsSchema.safeParse(
          parseToolArguments(call.function.arguments),
        );
        if (!parsed.success) {
          messages.push({
            role: "tool",
            content: JSON.stringify({ error: "invalid query" }),
          });
          continue;
        }
        const results = await executeSearch(parsed.data.query, signal);
        collected.push(...results);
        messages.push({
          role: "tool",
          content: JSON.stringify(results.slice(0, 8)),
        });
        if (collected.length > 0) break;
      }
      // Search results are already usable; no extra completion is needed.
      if (collected.length > 0) break;
    }
    return deduplicateResults(collected);
  }

  async json<T>(
    input: { system: string; user: string; maxOutputTokens?: number },
    parser: z.ZodType<T>,
    signal?: AbortSignal,
  ) {
    const schema = z.toJSONSchema(parser, { target: "draft-7" });
    const response = await this.chat(
      {
        messages: [
          {
            role: "system",
            content: `${input.system}\n出力は次のJSONスキーマに一致するJSONだけにしてください。Markdownやコードブロックは不要です。\n${JSON.stringify(schema)}`,
          },
          { role: "user", content: input.user },
        ],
        format: schema,
      },
      signal,
      input.maxOutputTokens ?? 1024,
    );
    const content = response.message?.content;
    if (!content) throw new OllamaOutputError("invalid_json");
    let value: unknown;
    try {
      value = JSON.parse(content);
    } catch {
      throw new OllamaOutputError("invalid_json");
    }
    if (!hasCleanModelFields(value))
      throw new OllamaOutputError("invalid_text");
    const parsed = parser.safeParse(value);
    if (!parsed.success) throw new OllamaOutputError("invalid_structure");
    return parsed.data;
  }

  private chat(
    input: {
      messages: OllamaMessage[];
      tools?: unknown[];
      format?: Record<string, unknown>;
    },
    signal?: AbortSignal,
    maxOutputTokens = 1024,
  ) {
    if (
      !Number.isInteger(maxOutputTokens) ||
      maxOutputTokens < 1 ||
      maxOutputTokens > 4096
    )
      throw new RangeError(
        "Ollama output token limit must be between 1 and 4096",
      );
    return this.request<OllamaChatResponse>(
      "/api/chat",
      {
        model: this.chatModel,
        stream: false,
        think: false,
        keep_alive: "10m",
        options: {
          temperature: 0,
          num_predict: maxOutputTokens,
          ...(input.format ? { stop: ["```"] } : {}),
        },
        ...input,
      },
      signal,
    ).then((response) => {
      if (response.done_reason === "length")
        throw new OllamaOutputError("output_limit");
      if (response.done === false)
        throw new OllamaOutputError("invalid_structure");
      return response;
    });
  }

  private async request<T>(path: string, body: unknown, signal?: AbortSignal) {
    const timeoutSignal = AbortSignal.timeout(this.requestTimeoutMs);
    const requestSignal = signal
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal;
    const response = await this.fetchImplementation(
      new URL(path, withTrailingSlash(this.baseUrl)),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: requestSignal,
      },
    );
    if (!response.ok) {
      throw new Error(`Ollama returned HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  }
}

function deduplicateResults(results: WebSearchResult[]) {
  const seen = new Set<string>();
  return results.filter((result) => {
    if (seen.has(result.url)) return false;
    seen.add(result.url);
    return true;
  });
}

function withTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function parseToolArguments(value: unknown) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function assertLocalOllamaUrl(value: string) {
  const url = new URL(value);
  const allowedHosts = new Set([
    "localhost",
    "127.0.0.1",
    "[::1]",
    "host.docker.internal",
  ]);
  if (url.protocol !== "http:" || !allowedHosts.has(url.hostname)) {
    throw new Error(
      "OLLAMA_BASE_URL must point to local Ollama (localhost or host.docker.internal)",
    );
  }
}
