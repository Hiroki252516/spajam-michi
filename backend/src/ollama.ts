import { z } from "zod";

import type { WebSearchResult } from "./duckduckgo.js";
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
};

const searchArgumentsSchema = z.object({ query: z.string().min(1).max(160) });

export class OllamaClient {
  constructor(
    readonly baseUrl: string,
    readonly chatModel: string,
    readonly embeddingModel: string,
    private readonly fetchImplementation: typeof fetch = fetch,
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
    while (remainingCalls > 0) {
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
                    parameters: {
                      type: "object",
                      required: ["query"],
                      properties: {
                        query: {
                          type: "string",
                          description: "地域名、日付、イベント種別を含む検索語",
                        },
                      },
                    },
                  },
                },
              ],
            },
            signal,
          ),
      );
      const message = response.message;
      if (!message) throw new Error("Ollama returned no chat message");
      messages.push(message);
      const calls = message.tool_calls ?? [];
      if (calls.length === 0) break;
      for (const call of calls) {
        if (remainingCalls === 0) break;
        if (call.function.name !== "search_events") {
          messages.push({
            role: "tool",
            content: JSON.stringify({ error: "unknown tool" }),
          });
          continue;
        }
        remainingCalls -= 1;
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
      }
    }
    return deduplicateResults(collected);
  }

  async json<T>(
    input: { system: string; user: string; schema: Record<string, unknown> },
    parser: z.ZodType<T>,
    signal?: AbortSignal,
  ) {
    const response = await this.chat(
      {
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
        format: input.schema,
      },
      signal,
    );
    const content = response.message?.content;
    if (!content) throw new Error("Ollama returned empty structured output");
    return parser.parse(JSON.parse(content));
  }

  private chat(
    input: {
      messages: OllamaMessage[];
      tools?: unknown[];
      format?: Record<string, unknown>;
    },
    signal?: AbortSignal,
  ) {
    return this.request<OllamaChatResponse>(
      "/api/chat",
      {
        model: this.chatModel,
        stream: false,
        think: false,
        keep_alive: "10m",
        options: { temperature: 0 },
        ...input,
      },
      signal,
    );
  }

  private async request<T>(path: string, body: unknown, signal?: AbortSignal) {
    const response = await this.fetchImplementation(
      new URL(path, withTrailingSlash(this.baseUrl)),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
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
