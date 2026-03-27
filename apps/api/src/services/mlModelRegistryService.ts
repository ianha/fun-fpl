import type { AppDatabase } from "../db/database.js";

function now() {
  return new Date().toISOString();
}

export type MlModelRegistryRecord = {
  id: number;
  modelName: string;
  targetMetric: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MlModelVersionRecord = {
  id: number;
  registryId: number;
  versionTag: string | null;
  coefficients: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
  gameweekScope: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PendingMlEvaluationState = {
  gameweekId: number;
  gameweekIds: number[];
  triggeredAt: string;
  status: "pending";
};

type RegistryRow = {
  id: number;
  model_name: string;
  target_metric: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

type VersionRow = {
  id: number;
  registry_id: number;
  version_tag: string | null;
  coefficients_json: string;
  metadata_json: string | null;
  gameweek_scope: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
};

export class MlModelRegistryService {
  private static readonly pendingMlEvaluationKey = "pending_ml_evaluation";

  constructor(private readonly db: AppDatabase) {}

  createRegistry(input: {
    modelName: string;
    targetMetric: string;
    description?: string | null;
  }): MlModelRegistryRecord {
    const timestamp = now();
    const result = this.db
      .prepare(
        `INSERT INTO ml_model_registry (
          model_name, target_metric, description, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        input.modelName,
        input.targetMetric,
        input.description ?? null,
        timestamp,
        timestamp,
      );

    return this.getRegistryById(Number(result.lastInsertRowid));
  }

  getRegistryByModelName(modelName: string): MlModelRegistryRecord | null {
    const row = this.db
      .prepare(
        `SELECT id, model_name, target_metric, description, created_at, updated_at
         FROM ml_model_registry
         WHERE model_name = ?`,
      )
      .get(modelName) as RegistryRow | undefined;

    if (!row) return null;

    return {
      id: row.id,
      modelName: row.model_name,
      targetMetric: row.target_metric,
      description: row.description,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  ensureRegistry(input: {
    modelName: string;
    targetMetric: string;
    description?: string | null;
  }): MlModelRegistryRecord {
    return (
      this.getRegistryByModelName(input.modelName) ??
      this.createRegistry(input)
    );
  }

  getRegistryById(id: number): MlModelRegistryRecord {
    const row = this.db
      .prepare(
        `SELECT id, model_name, target_metric, description, created_at, updated_at
         FROM ml_model_registry
         WHERE id = ?`,
      )
      .get(id) as RegistryRow | undefined;

    if (!row) {
      throw new Error(`ML model registry ${id} not found.`);
    }

    return {
      id: row.id,
      modelName: row.model_name,
      targetMetric: row.target_metric,
      description: row.description,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  createVersion(input: {
    registryId: number;
    versionTag?: string | null;
    coefficients: Record<string, unknown>;
    metadata?: Record<string, unknown> | null;
    gameweekScope?: string | null;
    activate?: boolean;
  }): MlModelVersionRecord {
    const timestamp = now();

    const insertVersion = this.db.transaction(() => {
      if (input.activate) {
        this.db
          .prepare(
            `UPDATE ml_model_versions
             SET is_active = 0, updated_at = ?
             WHERE registry_id = ? AND is_active = 1`,
          )
          .run(timestamp, input.registryId);
      }

      const result = this.db
        .prepare(
          `INSERT INTO ml_model_versions (
            registry_id,
            version_tag,
            coefficients_json,
            metadata_json,
            gameweek_scope,
            is_active,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.registryId,
          input.versionTag ?? null,
          JSON.stringify(input.coefficients),
          input.metadata ? JSON.stringify(input.metadata) : null,
          input.gameweekScope ?? null,
          Number(Boolean(input.activate)),
          timestamp,
          timestamp,
        );

      return Number(result.lastInsertRowid);
    });

    return this.getVersionById(insertVersion());
  }

  getVersionById(id: number): MlModelVersionRecord {
    const row = this.db
      .prepare(
        `SELECT
           id,
           registry_id,
           version_tag,
           coefficients_json,
           metadata_json,
           gameweek_scope,
           is_active,
           created_at,
           updated_at
         FROM ml_model_versions
         WHERE id = ?`,
      )
      .get(id) as VersionRow | undefined;

    if (!row) {
      throw new Error(`ML model version ${id} not found.`);
    }

    return {
      id: row.id,
      registryId: row.registry_id,
      versionTag: row.version_tag,
      coefficients: JSON.parse(row.coefficients_json) as Record<string, unknown>,
      metadata: row.metadata_json
        ? (JSON.parse(row.metadata_json) as Record<string, unknown>)
        : null,
      gameweekScope: row.gameweek_scope,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  getActiveVersion(registryId: number): MlModelVersionRecord | null {
    const row = this.db
      .prepare(
        `SELECT
           id,
           registry_id,
           version_tag,
           coefficients_json,
           metadata_json,
           gameweek_scope,
           is_active,
           created_at,
           updated_at
         FROM ml_model_versions
         WHERE registry_id = ? AND is_active = 1`,
      )
      .get(registryId) as VersionRow | undefined;

    if (!row) return null;

    return this.getVersionById(row.id);
  }

  getActiveVersionForModelName(modelName: string): MlModelVersionRecord | null {
    const registry = this.getRegistryByModelName(modelName);
    if (!registry) return null;
    return this.getActiveVersion(registry.id);
  }

  setPendingMlEvaluation(gameweekId: number): PendingMlEvaluationState {
    const current = this.getPendingMlEvaluation();
    if (current && current.gameweekIds.includes(gameweekId)) {
      return current;
    }

    const triggeredAt = current?.triggeredAt ?? now();
    const gameweekIds = current
      ? [...current.gameweekIds, gameweekId].sort((a, b) => a - b)
      : [gameweekId];
    const payload: PendingMlEvaluationState = {
      gameweekId: gameweekIds[0] ?? gameweekId,
      gameweekIds,
      triggeredAt,
      status: "pending",
    };

    this.persistPendingMlEvaluation(payload);

    return payload;
  }

  clearPendingMlEvaluation(gameweekId?: number) {
    const current = this.getPendingMlEvaluation();
    if (!current) {
      return null;
    }

    if (gameweekId === undefined) {
      this.db
        .prepare("DELETE FROM sync_state WHERE key = ?")
        .run(MlModelRegistryService.pendingMlEvaluationKey);
      return null;
    }

    const remainingGameweekIds = current.gameweekIds.filter((id) => id !== gameweekId);
    if (remainingGameweekIds.length === 0) {
      this.db
        .prepare("DELETE FROM sync_state WHERE key = ?")
        .run(MlModelRegistryService.pendingMlEvaluationKey);
      return null;
    }

    const payload: PendingMlEvaluationState = {
      gameweekId: remainingGameweekIds[0]!,
      gameweekIds: remainingGameweekIds,
      triggeredAt: current.triggeredAt,
      status: "pending",
    };
    this.persistPendingMlEvaluation(payload);
    return payload;
  }

  getPendingMlEvaluation(): PendingMlEvaluationState | null {
    const row = this.db
      .prepare("SELECT value FROM sync_state WHERE key = ?")
      .get(MlModelRegistryService.pendingMlEvaluationKey) as
      | { value: string }
      | undefined;

    if (!row) return null;
    const parsed = JSON.parse(row.value) as Partial<PendingMlEvaluationState>;
    const gameweekIds = Array.isArray(parsed.gameweekIds)
      ? parsed.gameweekIds.filter(
          (value): value is number =>
            typeof value === "number" && Number.isInteger(value),
        )
      : (
          typeof parsed.gameweekId === "number" && Number.isInteger(parsed.gameweekId)
            ? [parsed.gameweekId]
            : []
        );

    if (gameweekIds.length === 0 || parsed.status !== "pending" || typeof parsed.triggeredAt !== "string") {
      return null;
    }

    return {
      gameweekId: gameweekIds[0]!,
      gameweekIds,
      triggeredAt: parsed.triggeredAt,
      status: "pending",
    };
  }

  private persistPendingMlEvaluation(payload: PendingMlEvaluationState) {
    this.db
      .prepare(
        `INSERT INTO sync_state (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = excluded.updated_at`,
      )
      .run(
        MlModelRegistryService.pendingMlEvaluationKey,
        JSON.stringify(payload),
        now(),
      );
  }
}
