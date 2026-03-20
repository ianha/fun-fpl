import { pathToFileURL } from "node:url";
import { createDatabase } from "../db/database.js";
import { MyTeamSyncService } from "../my-team/myTeamSyncService.js";

function parseGameweekArg(argv: string[]) {
  const gameweekIndex = argv.findIndex((arg) => arg === "--gameweek" || arg === "-g");
  if (gameweekIndex >= 0) {
    const value = argv[gameweekIndex + 1];
    if (!value || Number.isNaN(Number(value)) || Number(value) <= 0) {
      throw new Error("`--gameweek` must be followed by a positive integer.");
    }
    return Number(value);
  }

  const prefixedArg = argv.find((arg) => arg.startsWith("--gameweek="));
  if (!prefixedArg) return undefined;

  const value = prefixedArg.split("=")[1];
  if (!value || Number.isNaN(Number(value)) || Number(value) <= 0) {
    throw new Error("`--gameweek` must be a positive integer.");
  }
  return Number(value);
}

function parsePositiveIntegerArg(argv: string[], names: string[], label: string) {
  const argIndex = argv.findIndex((arg) => names.includes(arg));
  if (argIndex >= 0) {
    const value = argv[argIndex + 1];
    if (!value || Number.isNaN(Number(value)) || Number(value) <= 0) {
      throw new Error(`\`${label}\` must be followed by a positive integer.`);
    }
    return Number(value);
  }

  const prefixedArg = argv.find((arg) => names.some((name) => arg.startsWith(`${name}=`)));
  if (!prefixedArg) return undefined;

  const value = prefixedArg.split("=")[1];
  if (!value || Number.isNaN(Number(value)) || Number(value) <= 0) {
    throw new Error(`\`${label}\` must be a positive integer.`);
  }
  return Number(value);
}

function parseStringArg(argv: string[], names: string[], label: string) {
  const argIndex = argv.findIndex((arg) => names.includes(arg));
  if (argIndex >= 0) {
    const value = argv[argIndex + 1]?.trim();
    if (!value) {
      throw new Error(`\`${label}\` must be followed by a value.`);
    }
    return value;
  }

  const prefixedArg = argv.find((arg) => names.some((name) => arg.startsWith(`${name}=`)));
  if (!prefixedArg) return undefined;

  const value = prefixedArg.split("=")[1]?.trim();
  if (!value) {
    throw new Error(`\`${label}\` must be a non-empty value.`);
  }
  return value;
}

export function parseSyncMyTeamArgs(argv: string[]) {
  const force = argv.includes("--force");
  const gameweek = parseGameweekArg(argv);
  const accountId = parsePositiveIntegerArg(argv, ["--account", "-a"], "--account");
  const email = parseStringArg(argv, ["--email", "-e"], "--email");

  if (accountId && email) {
    throw new Error("Use either `--account` or `--email`, not both.");
  }

  return {
    force,
    gameweek,
    accountId,
    email,
  };
}

async function run() {
  const argv = process.argv.slice(2);
  const { force, gameweek, accountId, email } = parseSyncMyTeamArgs(argv);

  const db = createDatabase();
  const service = new MyTeamSyncService(db);

  if (accountId) {
    const result = await service.syncAccount(accountId, force, gameweek);
    console.log(
      `My Team sync completed for account ${accountId}${gameweek ? ` in GW ${gameweek}` : ""}${force ? " (forced)" : ""}. Synced ${result.syncedGameweeks} gameweek(s).`,
    );
    return;
  }

  if (email) {
    const accounts = service.getAccounts() as Array<{ id: number; email: string }>;
    const account = accounts
      .find((candidate) => candidate.email.toLowerCase() === email.toLowerCase());

    if (!account) {
      throw new Error(`No linked My Team account found for ${email}.`);
    }

    const result = await service.syncAccount(account.id, force, gameweek);
    console.log(
      `My Team sync completed for ${account.email}${gameweek ? ` in GW ${gameweek}` : ""}${force ? " (forced)" : ""}. Synced ${result.syncedGameweeks} gameweek(s).`,
    );
    return;
  }

  const results = await service.syncAll(force, gameweek);
  const failures = results.filter((result) => "error" in result);
  console.log(
    `My Team sync completed${gameweek ? ` for GW ${gameweek}` : ""}${force ? " (forced)" : ""}. Synced ${results.length - failures.length} account(s).`,
  );
  if (failures.length > 0) {
    console.error(
      failures
        .map((failure) => `Account ${failure.accountId} needs attention: ${failure.error}`)
        .join("\n"),
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
