import { createServer } from "node:http";
import mongoose from "mongoose";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { startGenerationWorker } from "./services/generation/generation-worker.js";

if (env.isProduction && env.SESSION_SECRET === "development-secret-change-this-value") {
  throw new Error("SESSION_SECRET must be set to a strong random value in production.");
}

await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
await startGenerationWorker();
const server = createServer(createApp());
server.listen(env.PORT, "0.0.0.0", () => console.log(`Interview kit API listening on port ${env.PORT}`));

async function shutdown(signal: string) {
  console.log(`${signal} received; closing API server`);
  server.close(async () => {
    await mongoose.disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
