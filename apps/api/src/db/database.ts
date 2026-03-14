import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { env } from "../config/env.js";
import { playerHistoryTableSql, schemaSql } from "./schema.js";

type ColumnDefinition = {
  name: string;
  sql: string;
};

function migratePlayerHistoryPrimaryKey(db: Database.Database) {
  const tableInfo = db
    .prepare("PRAGMA table_info(player_history)")
    .all() as Array<{ name: string; pk: number }>;

  if (tableInfo.length === 0) {
    return;
  }

  const primaryKeyColumns = tableInfo
    .filter((column) => column.pk > 0)
    .sort((left, right) => left.pk - right.pk)
    .map((column) => column.name);

  const expected = ["player_id", "round", "opponent_team", "kickoff_time"];
  if (JSON.stringify(primaryKeyColumns) === JSON.stringify(expected)) {
    return;
  }

  db.transaction(() => {
    db.exec("ALTER TABLE player_history RENAME TO player_history_legacy");
    db.exec(playerHistoryTableSql);
    db.exec(`
      INSERT OR IGNORE INTO player_history (
        player_id, round, total_points, minutes, goals_scored, assists,
        clean_sheets, bonus, bps, creativity, influence, threat, ict_index,
        expected_goals, expected_assists, expected_goal_involvements,
        expected_goals_conceded, tackles, recoveries,
        clearances_blocks_interceptions, defensive_contribution, starts,
        opponent_team, value, was_home, kickoff_time, updated_at
      )
      SELECT
        player_id, round, total_points, minutes, goals_scored, assists,
        clean_sheets,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        opponent_team, value, was_home, kickoff_time, updated_at
      FROM player_history_legacy
    `);
    db.exec("DROP TABLE player_history_legacy");
  })();
}

function ensureColumns(
  db: Database.Database,
  tableName: string,
  columns: ColumnDefinition[],
) {
  const existingColumns = new Set(
    (db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );

  for (const column of columns) {
    if (!existingColumns.has(column.name)) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${column.sql}`);
    }
  }
}

export function createDatabase(dbPath = env.dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(schemaSql);
  migratePlayerHistoryPrimaryKey(db);
  ensureColumns(db, "players", [
    { name: "bonus", sql: "bonus INTEGER NOT NULL DEFAULT 0" },
    { name: "bps", sql: "bps INTEGER NOT NULL DEFAULT 0" },
    { name: "creativity", sql: "creativity REAL NOT NULL DEFAULT 0" },
    { name: "influence", sql: "influence REAL NOT NULL DEFAULT 0" },
    { name: "threat", sql: "threat REAL NOT NULL DEFAULT 0" },
    { name: "ict_index", sql: "ict_index REAL NOT NULL DEFAULT 0" },
    { name: "expected_goals", sql: "expected_goals REAL NOT NULL DEFAULT 0" },
    { name: "expected_assists", sql: "expected_assists REAL NOT NULL DEFAULT 0" },
    {
      name: "expected_goal_involvements",
      sql: "expected_goal_involvements REAL NOT NULL DEFAULT 0",
    },
    {
      name: "expected_goals_conceded",
      sql: "expected_goals_conceded REAL NOT NULL DEFAULT 0",
    },
    {
      name: "clean_sheets_per_90",
      sql: "clean_sheets_per_90 REAL NOT NULL DEFAULT 0",
    },
    { name: "starts", sql: "starts INTEGER NOT NULL DEFAULT 0" },
    { name: "tackles", sql: "tackles INTEGER NOT NULL DEFAULT 0" },
    { name: "recoveries", sql: "recoveries INTEGER NOT NULL DEFAULT 0" },
    {
      name: "defensive_contribution",
      sql: "defensive_contribution INTEGER NOT NULL DEFAULT 0",
    },
  ]);
  ensureColumns(db, "player_history", [
    { name: "bonus", sql: "bonus INTEGER NOT NULL DEFAULT 0" },
    { name: "bps", sql: "bps INTEGER NOT NULL DEFAULT 0" },
    { name: "creativity", sql: "creativity REAL NOT NULL DEFAULT 0" },
    { name: "influence", sql: "influence REAL NOT NULL DEFAULT 0" },
    { name: "threat", sql: "threat REAL NOT NULL DEFAULT 0" },
    { name: "ict_index", sql: "ict_index REAL NOT NULL DEFAULT 0" },
    { name: "expected_goals", sql: "expected_goals REAL NOT NULL DEFAULT 0" },
    { name: "expected_assists", sql: "expected_assists REAL NOT NULL DEFAULT 0" },
    {
      name: "expected_goal_involvements",
      sql: "expected_goal_involvements REAL NOT NULL DEFAULT 0",
    },
    {
      name: "expected_goals_conceded",
      sql: "expected_goals_conceded REAL NOT NULL DEFAULT 0",
    },
    { name: "tackles", sql: "tackles INTEGER NOT NULL DEFAULT 0" },
    { name: "recoveries", sql: "recoveries INTEGER NOT NULL DEFAULT 0" },
    {
      name: "clearances_blocks_interceptions",
      sql: "clearances_blocks_interceptions INTEGER NOT NULL DEFAULT 0",
    },
    {
      name: "defensive_contribution",
      sql: "defensive_contribution INTEGER NOT NULL DEFAULT 0",
    },
    { name: "starts", sql: "starts INTEGER NOT NULL DEFAULT 0" },
  ]);
  ensureColumns(db, "player_sync_status", [
    { name: "requested_snapshot", sql: "requested_snapshot TEXT" },
    { name: "completed_snapshot", sql: "completed_snapshot TEXT" },
  ]);
  ensureColumns(db, "gameweek_player_sync_status", [
    { name: "requested_snapshot", sql: "requested_snapshot TEXT" },
    { name: "completed_snapshot", sql: "completed_snapshot TEXT" },
  ]);
  return db;
}

export type AppDatabase = ReturnType<typeof createDatabase>;
