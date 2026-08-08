import "dotenv/config";

import { serve } from "@hono/node-server";
import { ensureDevelopmentUser } from "./auth.js";
import { createApp } from "./app.js";
import { openDatabase } from "./database.js";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) throw new Error("JWT_SECRET is required");
  const isDevelopment = process.env.NODE_ENV !== "production";
  const database = await openDatabase(databaseUrl, isDevelopment);
  if (isDevelopment) await ensureDevelopmentUser(database);
  const app = createApp(database, {
    jwtSecret,
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

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
