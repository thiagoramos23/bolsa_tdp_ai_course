import express from "express";
import { fileURLToPath } from "node:url";
import { pool, initialize } from "./db.js";
import { createApp } from "./app.js";
import { startQuoteWorker } from "./market.js";

if (!process.env.DATABASE_URL) throw new Error("Defina DATABASE_URL.");
await initialize();
const worker = startQuoteWorker(pool);
const app = createApp(pool, worker);
let vite;
if (process.env.NODE_ENV === "production") {
  const dist = fileURLToPath(new URL("../dist/", import.meta.url));
  app.use(express.static(dist));
  app.get("/{*path}", (_req, res) => res.sendFile(`${dist}index.html`));
} else {
  const { createServer } = await import("vite");
  vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
const server = app.listen(Number(process.env.PORT || 3007), "0.0.0.0", () =>
  console.log(`Bolsa Lab: ${process.env.APP_URL || "http://localhost:3007"}`),
);
async function shutdown() {
  server.close();
  await worker.stop();
  await vite?.close();
  await pool.end();
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
