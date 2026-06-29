import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

const databaseUrl = readDatabaseUrl();
const integrationEnabled = process.env.RUN_SUPABASE_SQL_INTEGRATION_TESTS === "1" && databaseUrl !== undefined;
const describeIfIntegration = integrationEnabled ? describe : describe.skip;

describeIfIntegration("Supabase SQL API usage ledger migration", () => {
  it("allows only service_role to execute the monthly-limit insert boundary", () => {
    const denied = runPsql(
      `
      begin;
      set local role authenticated;

      select public.record_api_usage_event_with_monthly_limit(
        '${randomUUID()}'::uuid,
        '${randomUUID()}'::uuid,
        null,
        null,
        'GET /2/users/me',
        'GET',
        'user',
        1,
        true,
        0.0100,
        null,
        null,
        null,
        200,
        now()
      );

      rollback;
      `,
      { expectFailure: true },
    );

    expect(denied.stderr).toContain("permission denied");
    expect(denied.stderr).toContain("record_api_usage_event_with_monthly_limit");
  });

  it("enforces ownership, backup_run consistency, non-negative values, and monthly limits", () => {
    const ids = createFixtureIds();

    runPsql(`
      begin;

      insert into auth.users (
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
      ) values
        (
          '${ids.userId}'::uuid,
          'authenticated',
          'authenticated',
          'ledger-user-${ids.suffix}@example.invalid',
          '',
          now(),
          '{}'::jsonb,
          '{}'::jsonb,
          now(),
          now()
        ),
        (
          '${ids.otherUserId}'::uuid,
          'authenticated',
          'authenticated',
          'ledger-other-${ids.suffix}@example.invalid',
          '',
          now(),
          '{}'::jsonb,
          '{}'::jsonb,
          now(),
          now()
        );

      insert into public.user_profiles (id, email, monthly_api_cost_limit_usd) values
        ('${ids.userId}'::uuid, 'ledger-user-${ids.suffix}@example.invalid', 0.0150),
        ('${ids.otherUserId}'::uuid, 'ledger-other-${ids.suffix}@example.invalid', 1.0000);

      insert into public.x_accounts (id, user_id, x_user_id, username) values
        ('${ids.xAccountId}'::uuid, '${ids.userId}'::uuid, 'x-${ids.suffix}', 'ledger_user_${ids.shortSuffix}'),
        ('${ids.secondXAccountId}'::uuid, '${ids.userId}'::uuid, 'x-second-${ids.suffix}', 'ledger_user_second_${ids.shortSuffix}'),
        ('${ids.otherXAccountId}'::uuid, '${ids.otherUserId}'::uuid, 'x-other-${ids.suffix}', 'ledger_other_${ids.shortSuffix}');

      insert into public.backup_runs (id, x_account_id, status, started_at, tweet_limit) values
        ('${ids.backupRunId}'::uuid, '${ids.xAccountId}'::uuid, 'running', now(), 100),
        ('${ids.otherBackupRunId}'::uuid, '${ids.otherXAccountId}'::uuid, 'running', now(), 100);

      set local role service_role;

      select public.record_api_usage_event_with_monthly_limit(
        '${ids.successEventId}'::uuid,
        '${ids.userId}'::uuid,
        '${ids.xAccountId}'::uuid,
        '${ids.backupRunId}'::uuid,
        'GET /2/users/me',
        'GET',
        'user',
        1,
        true,
        0.0100,
        15,
        14,
        now() + interval '15 minutes',
        200,
        now()
      );

      do $$
      begin
        perform public.record_api_usage_event_with_monthly_limit(
          '${ids.wrongAccountEventId}'::uuid,
          '${ids.userId}'::uuid,
          '${ids.otherXAccountId}'::uuid,
          null,
          'GET /2/users/me',
          'GET',
          'user',
          1,
          true,
          0.0000,
          null,
          null,
          null,
          200,
          now()
        );

        raise exception 'expected x_account ownership rejection';
      exception
        when sqlstate 'P0001' then
          if sqlerrm not like 'api_usage_ledger_x_account_not_found:%' then
            raise;
          end if;
      end $$;

      do $$
      begin
        perform public.record_api_usage_event_with_monthly_limit(
          '${ids.nullAccountBackupEventId}'::uuid,
          '${ids.userId}'::uuid,
          null,
          '${ids.backupRunId}'::uuid,
          'GET /2/users/:id/tweets',
          'GET',
          'post',
          1,
          true,
          0.0000,
          null,
          null,
          null,
          200,
          now()
        );

        raise exception 'expected x_account_id requirement for backup_run rejection';
      exception
        when sqlstate 'P0001' then
          if sqlerrm <> 'api_usage_ledger_x_account_required_for_backup_run' then
            raise;
          end if;
      end $$;

      do $$
      begin
        perform public.record_api_usage_event_with_monthly_limit(
          '${ids.missingBackupEventId}'::uuid,
          '${ids.userId}'::uuid,
          '${ids.xAccountId}'::uuid,
          '${ids.missingBackupRunId}'::uuid,
          'GET /2/users/:id/tweets',
          'GET',
          'post',
          1,
          true,
          0.0000,
          null,
          null,
          null,
          200,
          now()
        );

        raise exception 'expected missing backup_run rejection';
      exception
        when sqlstate 'P0001' then
          if sqlerrm not like 'api_usage_ledger_backup_run_not_found:%' then
            raise;
          end if;
      end $$;

      do $$
      begin
        perform public.record_api_usage_event_with_monthly_limit(
          '${ids.otherBackupEventId}'::uuid,
          '${ids.userId}'::uuid,
          '${ids.xAccountId}'::uuid,
          '${ids.otherBackupRunId}'::uuid,
          'GET /2/users/:id/tweets',
          'GET',
          'post',
          1,
          true,
          0.0000,
          null,
          null,
          null,
          200,
          now()
        );

        raise exception 'expected backup_run ownership rejection';
      exception
        when sqlstate 'P0001' then
          if sqlerrm not like 'api_usage_ledger_backup_run_not_found:%' then
            raise;
          end if;
      end $$;

      do $$
      begin
        perform public.record_api_usage_event_with_monthly_limit(
          '${ids.mismatchedAccountEventId}'::uuid,
          '${ids.userId}'::uuid,
          '${ids.secondXAccountId}'::uuid,
          '${ids.backupRunId}'::uuid,
          'GET /2/users/:id/tweets',
          'GET',
          'post',
          1,
          true,
          0.0000,
          null,
          null,
          null,
          200,
          now()
        );

        raise exception 'expected same X account rejection';
      exception
        when sqlstate 'P0001' then
          if sqlerrm not like 'api_usage_ledger_backup_run_not_found:%' then
            raise;
          end if;
      end $$;

      do $$
      begin
        perform public.record_api_usage_event_with_monthly_limit(
          '${ids.negativeEventId}'::uuid,
          '${ids.userId}'::uuid,
          '${ids.xAccountId}'::uuid,
          '${ids.backupRunId}'::uuid,
          'GET /2/users/:id/tweets',
          'GET',
          'post',
          -1,
          true,
          0.0000,
          null,
          null,
          null,
          200,
          now()
        );

        raise exception 'expected negative resource_count rejection';
      exception
        when sqlstate 'P0001' then
          if sqlerrm <> 'api_usage_ledger_invalid_non_negative_integer:resourceCount' then
            raise;
          end if;
      end $$;

      do $$
      begin
        perform public.record_api_usage_event_with_monthly_limit(
          '${ids.negativeCostEventId}'::uuid,
          '${ids.userId}'::uuid,
          '${ids.xAccountId}'::uuid,
          '${ids.backupRunId}'::uuid,
          'GET /2/users/:id/tweets',
          'GET',
          'post',
          1,
          true,
          -0.0100,
          null,
          null,
          null,
          200,
          now()
        );

        raise exception 'expected negative estimated_cost rejection';
      exception
        when sqlstate 'P0001' then
          if sqlerrm <> 'api_usage_ledger_invalid_non_negative_cost:estimatedCostUsd' then
            raise;
          end if;
      end $$;

      do $$
      begin
        perform public.record_api_usage_event_with_monthly_limit(
          '${ids.monthlyLimitEventId}'::uuid,
          '${ids.userId}'::uuid,
          '${ids.xAccountId}'::uuid,
          '${ids.backupRunId}'::uuid,
          'GET /2/users/:id/tweets',
          'GET',
          'post',
          1,
          true,
          0.0100,
          null,
          null,
          null,
          200,
          now()
        );

        raise exception 'expected monthly cost limit rejection';
      exception
        when sqlstate 'P0001' then
          if sqlerrm not like 'api_usage_ledger_monthly_cost_limit_exceeded:%' then
            raise;
          end if;
      end $$;

      reset role;

      do $$
      declare
        persisted_event_count integer;
      begin
        select count(*)::int
          into persisted_event_count
          from public.api_usage_events
          where user_id = '${ids.userId}'::uuid;

        if persisted_event_count <> 1 then
          raise exception 'expected exactly one persisted usage event, got %', persisted_event_count;
        end if;
      end $$;

      rollback;
    `);
  });
});

function runPsql(sql: string, options: { expectFailure?: boolean } = {}): { stdout: string; stderr: string } {
  if (!databaseUrl) {
    throw new Error("SUPABASE_DB_URL or POSTGRES_URL is required for Supabase SQL integration tests");
  }

  const result = spawnSync(
    readPsqlBin(),
    ["--no-psqlrc", "--quiet", "--no-align", "--tuples-only", "--set=ON_ERROR_STOP=1"],
    {
      env: {
        ...process.env,
        PGDATABASE: databaseUrl,
      },
      input: sql,
      encoding: "utf8",
    },
  );
  const stdout = sanitizePsqlOutput(result.stdout);
  const stderr = sanitizePsqlOutput(result.stderr);

  if (result.error) {
    throw result.error;
  }

  if (options.expectFailure) {
    expect(result.status).not.toBe(0);
    return { stdout, stderr };
  }

  if (result.status !== 0) {
    throw new Error(`psql exited with ${result.status}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  }

  return { stdout, stderr };
}

function readDatabaseUrl(): string | undefined {
  return process.env.SUPABASE_DB_URL?.trim() || process.env.POSTGRES_URL?.trim() || undefined;
}

function readPsqlBin(): string {
  return process.env.PSQL_BIN?.trim() || "psql";
}

function createFixtureIds(): Record<string, string> & { suffix: string; shortSuffix: string } {
  const suffix = randomUUID().replaceAll("-", "");
  const ids = {
    userId: randomUUID(),
    otherUserId: randomUUID(),
    xAccountId: randomUUID(),
    secondXAccountId: randomUUID(),
    otherXAccountId: randomUUID(),
    backupRunId: randomUUID(),
    otherBackupRunId: randomUUID(),
    missingBackupRunId: randomUUID(),
    successEventId: randomUUID(),
    wrongAccountEventId: randomUUID(),
    nullAccountBackupEventId: randomUUID(),
    missingBackupEventId: randomUUID(),
    otherBackupEventId: randomUUID(),
    mismatchedAccountEventId: randomUUID(),
    negativeEventId: randomUUID(),
    negativeCostEventId: randomUUID(),
    monthlyLimitEventId: randomUUID(),
  };

  return { ...ids, suffix, shortSuffix: suffix.slice(0, 12) };
}

function sanitizePsqlOutput(value: string | null): string {
  return (value ?? "").replaceAll(/postgres(?:ql)?:\/\/[^@\s]+@/g, "postgres://[redacted]@");
}
