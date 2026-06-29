import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

const databaseUrl = readDatabaseUrl();
const integrationEnabled = process.env.RUN_SUPABASE_SQL_INTEGRATION_TESTS === "1" && databaseUrl !== undefined;
const describeIfIntegration = integrationEnabled ? describe : describe.skip;

describeIfIntegration("Supabase SQL content compliance events contract", () => {
  it("keeps direct writes service-role only while allowing proof_page_revoked inserts and reads", () => {
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
          'compliance-user-${ids.suffix}@example.invalid',
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
          'compliance-other-${ids.suffix}@example.invalid',
          '',
          now(),
          '{}'::jsonb,
          '{}'::jsonb,
          now(),
          now()
        );

      insert into public.user_profiles (id, email) values
        ('${ids.userId}'::uuid, 'compliance-user-${ids.suffix}@example.invalid'),
        ('${ids.otherUserId}'::uuid, 'compliance-other-${ids.suffix}@example.invalid');

      insert into public.x_accounts (id, user_id, x_user_id, username) values
        ('${ids.xAccountId}'::uuid, '${ids.userId}'::uuid, 'x-compliance-${ids.suffix}', 'compliance_user_${ids.shortSuffix}'),
        ('${ids.otherXAccountId}'::uuid, '${ids.otherUserId}'::uuid, 'x-compliance-other-${ids.suffix}', 'compliance_other_${ids.shortSuffix}');

      insert into public.proof_pages (id, user_id, x_account_id, slug, visibility, public_payload) values
        (
          '${ids.proofPageId}'::uuid,
          '${ids.userId}'::uuid,
          '${ids.xAccountId}'::uuid,
          'compliance-proof-${ids.suffix}',
          'revoked',
          '{"title":"Revoked proof page"}'::jsonb
        ),
        (
          '${ids.otherProofPageId}'::uuid,
          '${ids.otherUserId}'::uuid,
          '${ids.otherXAccountId}'::uuid,
          'compliance-proof-other-${ids.suffix}',
          'revoked',
          '{"title":"Other revoked proof page"}'::jsonb
        );

      set local role authenticated;
      select set_config('request.jwt.claim.sub', '${ids.userId}', true);

      do $$
      begin
        insert into public.content_compliance_events (
          id,
          x_account_id,
          proof_page_id,
          event_type,
          source,
          details,
          created_at
        ) values (
          '${ids.deniedEventId}'::uuid,
          '${ids.xAccountId}'::uuid,
          '${ids.proofPageId}'::uuid,
          'proof_page_revoked',
          'user_request',
          '{"runId":"denied-run"}'::jsonb,
          now()
        );

        raise exception 'expected authenticated direct content_compliance_events insert rejection';
      exception
        when insufficient_privilege then
          null;
        when others then
          if sqlerrm not like '%row-level security%' then
            raise;
          end if;
      end $$;

      reset role;
      set local role service_role;

      insert into public.content_compliance_events (
        id,
        x_account_id,
        proof_page_id,
        event_type,
        source,
        details,
        created_at
      ) values (
        '${ids.allowedEventId}'::uuid,
        '${ids.xAccountId}'::uuid,
        '${ids.proofPageId}'::uuid,
        'proof_page_revoked',
        'user_request',
        '{"runId":"allowed-run","previousVisibility":"public","newVisibility":"revoked"}'::jsonb,
        '2026-06-24T04:30:00Z'::timestamptz
      );

      insert into public.content_compliance_events (
        id,
        x_account_id,
        proof_page_id,
        event_type,
        source,
        details,
        created_at
      ) values (
        '${ids.allowedOtherEventId}'::uuid,
        '${ids.otherXAccountId}'::uuid,
        '${ids.otherProofPageId}'::uuid,
        'proof_page_revoked',
        'user_request',
        '{"runId":"other-run"}'::jsonb,
        '2026-06-24T04:31:00Z'::timestamptz
      );

      do $$
      declare
        event_count integer;
        stored_event record;
      begin
        select count(*)::int
          into event_count
          from public.content_compliance_events
          where x_account_id = '${ids.xAccountId}'::uuid;

        if event_count <> 1 then
          raise exception 'expected one service-role compliance event, got %', event_count;
        end if;

        select event_type, source, proof_page_id, details
          into stored_event
          from public.content_compliance_events
          where id = '${ids.allowedEventId}'::uuid;

        if stored_event.event_type <> 'proof_page_revoked'::public.content_compliance_event_type then
          raise exception 'unexpected event_type %', stored_event.event_type;
        end if;

        if stored_event.source <> 'user_request' then
          raise exception 'unexpected source %', stored_event.source;
        end if;

        if stored_event.proof_page_id <> '${ids.proofPageId}'::uuid then
          raise exception 'unexpected proof_page_id %', stored_event.proof_page_id;
        end if;

        if stored_event.details <> '{"runId":"allowed-run","newVisibility":"revoked","previousVisibility":"public"}'::jsonb then
          raise exception 'unexpected details %', stored_event.details;
        end if;
      end $$;

      reset role;
      set local role authenticated;
      select set_config('request.jwt.claim.sub', '${ids.userId}', true);

      do $$
      declare
        visible_event_count integer;
        visible_other_event_count integer;
      begin
        select count(*)::int
          into visible_event_count
          from public.content_compliance_events
          where id = '${ids.allowedEventId}'::uuid;

        if visible_event_count <> 1 then
          raise exception 'expected authenticated user to read own compliance event, got %', visible_event_count;
        end if;

        select count(*)::int
          into visible_other_event_count
          from public.content_compliance_events
          where id = '${ids.allowedOtherEventId}'::uuid;

        if visible_other_event_count <> 0 then
          raise exception 'expected authenticated user not to read other compliance event, got %', visible_other_event_count;
        end if;
      end $$;

      reset role;

      rollback;
    `);
  });
});

function runPsql(sql: string, options: { expectFailure?: boolean } = {}): { stdout: string; stderr: string } {
  if (!databaseUrl) {
    throw new Error("SUPABASE_DB_URL or POSTGRES_URL is required for Supabase SQL integration tests");
  }

  const result = spawnSync(
    process.env.PSQL_BIN ?? "psql",
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

function createFixtureIds(): Record<string, string> & { suffix: string; shortSuffix: string } {
  const suffix = randomUUID().replaceAll("-", "");
  const ids = {
    userId: randomUUID(),
    otherUserId: randomUUID(),
    xAccountId: randomUUID(),
    otherXAccountId: randomUUID(),
    proofPageId: randomUUID(),
    otherProofPageId: randomUUID(),
    allowedEventId: randomUUID(),
    allowedOtherEventId: randomUUID(),
    deniedEventId: randomUUID(),
  };

  return { ...ids, suffix, shortSuffix: suffix.slice(0, 12) };
}

function sanitizePsqlOutput(value: string | null): string {
  return (value ?? "").replaceAll(/postgres(?:ql)?:\/\/[^@\s]+@/g, "postgres://[redacted]@");
}
