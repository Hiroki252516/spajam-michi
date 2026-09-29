import "dotenv/config";

import { serve } from "@hono/node-server";
import { ensureDevelopmentUser } from "./auth.js";
import { createApp } from "./app.js";
import { openDatabase } from "./database.js";
import { LocalLlmRecommendationService } from "./recommendation.js";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) throw new Error("JWT_SECRET is required");
  const isDevelopment = process.env.NODE_ENV !== "production";
  const database = await openDatabase(databaseUrl, isDevelopment);
  if (isDevelopment) await ensureDevelopmentUser(database);
  const recommendationService = new LocalLlmRecommendationService(database, {
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
    ollamaChatModel: process.env.OLLAMA_CHAT_MODEL ?? "gemma4:e2b",
    ollamaEmbeddingModel:
      process.env.OLLAMA_EMBEDDING_MODEL ?? "embeddinggemma:300m-qat-q4_0",
    ollamaRequestTimeoutMs: readPositiveInteger(
      process.env.OLLAMA_REQUEST_TIMEOUT_MS,
      15_000,
    ),
    transitApiBaseUrl:
      process.env.TRANSIT_API_BASE_URL ?? "https://api.transit.ls8h.com",
    searchTimeoutMs: readPositiveInteger(
      process.env.EVENT_SEARCH_JOB_TIMEOUT_MS,
      120_000,
    ),
    pageTimeoutMs: readPositiveInteger(
      process.env.EVENT_PAGE_TIMEOUT_MS,
      5_000,
    ),
    cacheTtlMs: readPositiveInteger(
      process.env.EVENT_SEARCH_CACHE_TTL_MS,
      15 * 60_000,
    ),
  });
  const app = createApp(database, {
    jwtSecret,
    recommendationService,
    enableSearchTimingDebug: readBoolean(
      process.env.EVENT_SEARCH_DEBUG_TIMINGS,
      false,
    ),
    enableDevelopmentEndpoints: isDevelopment,
  });

  const port = Number(process.env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid PORT value: ${process.env.PORT}`);
  }

  const server = serve(
    {
      fetch: app.fetch,
      port,
    },
    ({ port: listeningPort }) => {
      console.log(`LED Quattro API listening on port ${listeningPort}`);
    },
  );

  const shutdown = () => {
    server.close(() => {
      void database.close().finally(() => process.exit(0));
    });
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

function readPositiveInteger(value: string | undefined, fallback: number) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive integer value: ${value}`);
  }
  return parsed;
}

function readBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
