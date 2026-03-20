import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
dotenv.config({ path: path.join(workspaceRoot, ".env") });
dotenv.config({ path: path.join(workspaceRoot, ".env.example"), override: false });

const defaultDbPath = fileURLToPath(
  new URL("../../data/fpl.sqlite", import.meta.url),
);
const defaultAssetsDir = fileURLToPath(
  new URL("../../data/assets", import.meta.url),
);
const workspaceDbPath = path.resolve(process.cwd(), "apps/api/data/fpl.sqlite");
const workspaceAssetsDir = path.resolve(process.cwd(), "apps/api/data/assets");

export const env = {
  port: Number(process.env.PORT ?? 4000),
  baseUrl: process.env.FPL_BASE_URL ?? "https://fantasy.premierleague.com/api",
  siteUrl: process.env.FPL_SITE_URL ?? "https://fantasy.premierleague.com",
  dbPath: process.env.DB_PATH ?? (process.cwd().endsWith("/apps/api") ? path.resolve(defaultDbPath) : workspaceDbPath),
  assetsDir:
    process.env.ASSETS_DIR ??
    (process.cwd().endsWith("/apps/api")
      ? path.resolve(defaultAssetsDir)
      : workspaceAssetsDir),
  fplMinRequestIntervalMs: Number(process.env.FPL_MIN_REQUEST_INTERVAL_MS ?? 3000),
  fplAuthSecret: process.env.FPL_AUTH_SECRET ?? "",
};
