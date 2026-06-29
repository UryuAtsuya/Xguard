import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const checks = [];

function record(ok, message) {
  checks.push({ ok, message });
  console.log(`${ok ? "PASS" : "BLOCKED"} ${message}`);
}

record(
  process.env.RUN_SUPABASE_SQL_INTEGRATION_TESTS === "1",
  process.env.RUN_SUPABASE_SQL_INTEGRATION_TESTS === "1"
    ? "RUN_SUPABASE_SQL_INTEGRATION_TESTS is enabled"
    : "set RUN_SUPABASE_SQL_INTEGRATION_TESTS=1",
);

record(
  Boolean(process.env.SUPABASE_DB_URL?.trim() || process.env.POSTGRES_URL?.trim()),
  process.env.SUPABASE_DB_URL?.trim() || process.env.POSTGRES_URL?.trim()
    ? "database URL environment variable is present"
    : "set SUPABASE_DB_URL or POSTGRES_URL",
);

const psqlSource = process.env.PSQL_BIN?.trim() ? "PSQL_BIN" : "PATH";
const psqlBin = process.env.PSQL_BIN?.trim() || "psql";
const psqlCheck = spawnSync(psqlBin, ["--version"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
const psqlVersionOutput = `${psqlCheck.stdout ?? ""}${psqlCheck.stderr ?? ""}`;
const isPsqlExecutable =
  psqlCheck.error === undefined &&
  psqlCheck.status === 0 &&
  /\b(psql|PostgreSQL)\b/i.test(psqlVersionOutput);

record(
  isPsqlExecutable,
  isPsqlExecutable
    ? `psql executable is available via ${psqlSource}`
    : `psql executable is not available via ${psqlSource}`,
);

record(
  existsSync(resolve(process.cwd(), "supabase/schema.sql")),
  existsSync(resolve(process.cwd(), "supabase/schema.sql"))
    ? "supabase/schema.sql is present"
    : "supabase/schema.sql is missing",
);

process.exitCode = checks.every((check) => check.ok) ? 0 : 1;
