import cors from "cors";
import express from "express";
import { createApiRouter } from "./routes/createApiRouter.js";
import type { AppDatabase } from "./db/database.js";

export function createApp(db: AppDatabase) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use("/api", createApiRouter(db));
  return app;
}

