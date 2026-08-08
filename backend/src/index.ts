import "dotenv/config";

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { serve } from "@hono/node-server";
import { Hono } from "hono";

const databasePath = resolve(process.env.SQLITE_PATH ?? "./data/app.db");
mkdirSync(dirname(databasePath), { recursive: true });

const database = new DatabaseSync(databasePath);
database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS app_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
`);

const app = new Hono();

app.get("/", (context) =>
  context.json({
    name: "LED Quattro API",
    status: "ok",
  }),
);

app.get("/health", (context) => {
  const result = database
    .prepare("SELECT sqlite_version() AS version")
    .get() as { version: string };

  return context.json({
    status: "ok",
    database: "sqlite",
    sqliteVersion: result.version,
  });
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
    database.close();
    process.exit(0);
  });
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
