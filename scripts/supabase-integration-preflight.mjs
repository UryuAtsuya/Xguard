import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const checks = [];

function pass(message) {
  checks.push({ ok: true });
  console.log(`PASS ${message}`);
}

function blocked(message) {
  checks.push({ ok: false });
  console.log(`BLOCKED ${message}`);
}

if (process.env.RUN_SUPABASE_SQL_INTEGRATION_TESTS === "1") {
  pass("RUN_SUPABASE_SQL_INTEGRATION_TESTS is enabled");
} else {
  blocked("set RUN_SUPABASE_SQL_INTEGRATION_TESTS=1");
}

if (process.env.SUPABASE_DB_URL?.trim() || process.env.POSTGRES_URL?.trim()) {
  pass("database URL environment variable is present");
} else {
  blocked("set SUPABASE_DB_URL or POSTGRES_URL");
}

const psqlSource = process.env.PSQL_BIN?.trim() ? "PSQL_BIN" : "PATH";
const psqlBin = process.env.PSQL_BIN?.trim() || "psql";
const psqlCheck = spawnSync(psqlBin, ["--version"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});

if (psqlCheck.error) {
  blocked(`psql executable is not available via ${psqlSource}`);
} else if (psqlCheck.status === 0) {
  pass(`psql executable is available via ${psqlSource}`);
} else {
  blocked(`psql executable check failed via ${psqlSource}`);
}

const schemaPath = resolve(process.cwd(), "supabase/schema.sql");
if (existsSync(schemaPath)) {
  pass("supabase/schema.sql is present");
} else {
  blocked("supabase/schema.sql is missing");
}

process.exit(checks.every((check) => check.ok) ? 0 : 1);
