import type { AppDatabase } from "../db/database.js";
import { MlModelRegistryService } from "./mlModelRegistryService.js";
import { TrainingMatrixService, type TrainingMatrixRow } from "./trainingMatrixService.js";

const MODEL_NAME = "transfer_event_points_v2";
const TARGET_METRIC = "expected_raw_points";
const MIN_TRAINING_ROWS = 100;
const DEFAULT_LAMBDA = 1.0;
const COEFFICIENT_MIN = 0.1;
const COEFFICIENT_MAX = 5.0;

const COEFFICIENT_KEYS = [
  "goal_weight",
  "assist_weight",
  "clean_sheet_weight",
  "save_weight",
  "bonus_weight",
  "appearance_weight",
  "concede_penalty_weight",
] as const;

/** FPL positional point values matching projectFixturePoints() */
const GOAL_POINTS: Record<number, number> = { 1: 6, 2: 6, 3: 5, 4: 4 };
const CLEAN_SHEET_POINTS: Record<number, number> = { 1: 6, 2: 6, 3: 1, 4: 0 };
const CONCEDE_PENALTY: Record<number, number> = { 1: 1, 2: 1, 3: 0.5, 4: 0 };

export type RidgeRegressionResult = {
  coefficients: Record<string, number>;
  metadata: {
    lambda: number;
    trainingRows: number;
    gameweeks: number[];
    rSquared: number;
    coefficientsClamped: boolean;
    fittedAt: string;
  };
};

export type RetrainResult = {
  skipped: boolean;
  reason?: string;
  result?: RidgeRegressionResult;
  versionId?: number;
  versionTag?: string;
};

/**
 * Constructs the 7 feature columns from a training matrix row,
 * matching the coordinate system used in projectFixturePoints().
 *
 * Each feature represents the expected FPL points contribution
 * from that event category, so the learned weights are multiplicative
 * adjustments in the same space the projection engine applies them.
 */
export function buildFeatureRow(row: TrainingMatrixRow): number[] {
  const pos = row.positionId;
  return [
    row.rollingXg * (GOAL_POINTS[pos] ?? 4),          // goal_weight
    row.rollingXa * 3,                                  // assist_weight
    row.rollingCs * (CLEAN_SHEET_POINTS[pos] ?? 0),    // clean_sheet_weight
    row.rollingSaves / 3,                               // save_weight
    row.rollingBonus,                                   // bonus_weight
    row.rollingMinutes > 0 ? 2 : 0,                    // appearance_weight
    -(CONCEDE_PENALTY[pos] ?? 0) * row.rollingXgc / 2, // concede_penalty_weight (negative contribution)
  ];
}

// ─── Matrix math (small dense matrices, no dependencies) ──────────────

export function transpose(m: number[][]): number[][] {
  if (m.length === 0) return [];
  const rows = m.length;
  const cols = m[0]!.length;
  const result: number[][] = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[j]![i] = m[i]![j]!;
    }
  }
  return result;
}

export function multiply(a: number[][], b: number[][]): number[][] {
  const aRows = a.length;
  const aCols = a[0]!.length;
  const bCols = b[0]!.length;
  const result: number[][] = Array.from({ length: aRows }, () => new Array(bCols).fill(0));
  for (let i = 0; i < aRows; i++) {
    for (let j = 0; j < bCols; j++) {
      let sum = 0;
      for (let k = 0; k < aCols; k++) {
        sum += a[i]![k]! * b[k]![j]!;
      }
      result[i]![j] = sum;
    }
  }
  return result;
}

export function multiplyVector(m: number[][], v: number[]): number[] {
  return m.map((row) => row.reduce((sum, val, j) => sum + val * v[j]!, 0));
}

/**
 * Invert a square matrix using Gauss-Jordan elimination.
 * Throws if the matrix is singular.
 */
export function invert(m: number[][]): number[][] {
  const n = m.length;
  // Augment with identity
  const aug: number[][] = m.map((row, i) => {
    const identityRow = new Array(n).fill(0) as number[];
    identityRow[i] = 1;
    return [...row, ...identityRow];
  });

  for (let col = 0; col < n; col++) {
    // Partial pivoting
    let maxRow = col;
    let maxVal = Math.abs(aug[col]![col]!);
    for (let row = col + 1; row < n; row++) {
      const absVal = Math.abs(aug[row]![col]!);
      if (absVal > maxVal) {
        maxVal = absVal;
        maxRow = row;
      }
    }
    if (maxVal < 1e-12) {
      throw new Error("Matrix is singular and cannot be inverted.");
    }
    if (maxRow !== col) {
      [aug[col], aug[maxRow]] = [aug[maxRow]!, aug[col]!];
    }

    // Scale pivot row
    const pivot = aug[col]![col]!;
    for (let j = col; j < 2 * n; j++) {
      aug[col]![j]! /= pivot;
    }

    // Eliminate column
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row]![col]!;
      for (let j = col; j < 2 * n; j++) {
        aug[row]![j]! -= factor * aug[col]![j]!;
      }
    }
  }

  return aug.map((row) => row.slice(n));
}

/**
 * Fit ridge regression: w = (X^T X + λI)^{-1} X^T y
 *
 * Returns raw coefficients (not yet clamped).
 */
export function fitRidge(X: number[][], y: number[], lambda: number): number[] {
  const Xt = transpose(X);
  const XtX = multiply(Xt, X);
  const p = XtX.length;

  // Add λI (regularization)
  for (let i = 0; i < p; i++) {
    XtX[i]![i]! += lambda;
  }

  const XtXInv = invert(XtX);
  const Xty = multiplyVector(Xt, y);
  return multiplyVector(XtXInv, Xty);
}

/** Clamp a value to [min, max], returning whether clamping occurred. */
function clamp(value: number, min: number, max: number): { value: number; clamped: boolean } {
  if (value < min) return { value: min, clamped: true };
  if (value > max) return { value: max, clamped: true };
  return { value, clamped: false };
}

/** Compute R-squared (coefficient of determination). */
export function computeRSquared(yActual: number[], yPredicted: number[]): number {
  const n = yActual.length;
  if (n === 0) return 0;
  const yMean = yActual.reduce((s, v) => s + v, 0) / n;
  const ssTot = yActual.reduce((s, v) => s + (v - yMean) ** 2, 0);
  const ssRes = yActual.reduce((s, v, i) => s + (v - yPredicted[i]!) ** 2, 0);
  return ssTot > 0 ? 1 - ssRes / ssTot : 0;
}

export class RidgeRegressionService {
  private readonly trainingMatrixService: TrainingMatrixService;
  private readonly mlModelRegistryService: MlModelRegistryService;

  constructor(private readonly db: AppDatabase) {
    this.trainingMatrixService = new TrainingMatrixService(db);
    this.mlModelRegistryService = new MlModelRegistryService(db);
  }

  /**
   * Fit a ridge regression model on training data from the specified gameweeks.
   * Returns null if insufficient training data.
   */
  fit(trainingRows: TrainingMatrixRow[], lambda = DEFAULT_LAMBDA): RidgeRegressionResult | null {
    if (trainingRows.length < MIN_TRAINING_ROWS) {
      return null;
    }

    const X = trainingRows.map(buildFeatureRow);
    const y = trainingRows.map((row) => row.actualPoints);

    const rawWeights = fitRidge(X, y, lambda);

    let anyClamped = false;
    const coefficients: Record<string, number> = {};
    for (let i = 0; i < COEFFICIENT_KEYS.length; i++) {
      const key = COEFFICIENT_KEYS[i]!;
      const raw = rawWeights[i]!;
      const { value, clamped } = clamp(raw, COEFFICIENT_MIN, COEFFICIENT_MAX);
      coefficients[key] = Math.round(value * 1000) / 1000; // 3 decimal places
      if (clamped) anyClamped = true;
    }

    // Compute R-squared
    const yPredicted = X.map((row) =>
      row.reduce((sum, val, j) => sum + val * rawWeights[j]!, 0),
    );
    const rSquared = Math.round(computeRSquared(y, yPredicted) * 1000) / 1000;

    return {
      coefficients,
      metadata: {
        lambda,
        trainingRows: trainingRows.length,
        gameweeks: [...new Set(trainingRows.map((r) => r.targetGameweek))].sort((a, b) => a - b),
        rSquared,
        coefficientsClamped: anyClamped,
        fittedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Collect training data from the specified gameweeks.
   */
  collectTrainingData(gameweeks: number[], lookbackWindow = 5): TrainingMatrixRow[] {
    const allRows: TrainingMatrixRow[] = [];
    for (const gw of gameweeks) {
      const rows = this.trainingMatrixService.getTrainingMatrix({
        targetGameweek: gw,
        lookbackWindow,
      });
      allRows.push(...rows);
    }
    return allRows;
  }

  /**
   * Train a model and write it to the registry.
   * Returns the result or a skip reason.
   */
  trainAndStore(input: {
    gameweeks: number[];
    lambda?: number;
    lookbackWindow?: number;
  }): RetrainResult {
    const { gameweeks, lambda = DEFAULT_LAMBDA, lookbackWindow = 5 } = input;

    if (gameweeks.length === 0) {
      return { skipped: true, reason: "No gameweeks to train on." };
    }

    const trainingRows = this.collectTrainingData(gameweeks, lookbackWindow);

    if (trainingRows.length < MIN_TRAINING_ROWS) {
      return {
        skipped: true,
        reason: `Insufficient training data: ${trainingRows.length} rows (minimum ${MIN_TRAINING_ROWS}).`,
      };
    }

    const result = this.fit(trainingRows, lambda);
    if (!result) {
      return { skipped: true, reason: "Model fitting returned no result." };
    }

    if (result.metadata.coefficientsClamped) {
      console.warn(
        "Ridge regression: one or more coefficients were clamped to [%s, %s].",
        COEFFICIENT_MIN,
        COEFFICIENT_MAX,
      );
    }

    const registry = this.mlModelRegistryService.ensureRegistry({
      modelName: MODEL_NAME,
      targetMetric: TARGET_METRIC,
    });

    const versionTag = gameweeks.length === 1
      ? `auto-gw${gameweeks[0]}`
      : `auto-gw${gameweeks[0]}-gw${gameweeks[gameweeks.length - 1]}`;

    const gameweekScope = gameweeks.length === 1
      ? `gw${gameweeks[0]}`
      : `gw${gameweeks[0]}-gw${gameweeks[gameweeks.length - 1]}`;

    const version = this.mlModelRegistryService.createVersion({
      registryId: registry.id,
      versionTag,
      coefficients: result.coefficients,
      metadata: result.metadata,
      gameweekScope,
      activate: true,
    });

    return {
      skipped: false,
      result,
      versionId: version.id,
      versionTag,
    };
  }
}
