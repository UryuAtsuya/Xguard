import { createClient } from "@supabase/supabase-js";

const email = normalizeEmail(requiredEnv("ADMIN_BOOTSTRAP_EMAIL"));
const supabaseUrl = requiredEnv("SUPABASE_URL");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const redirectTo = requiredHttpsUrl("ADMIN_REDIRECT_URL");

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const existingUser = await findAuthUserByEmail(email);
const user = existingUser ?? await inviteAuthUser(email);

const now = new Date().toISOString();
const { error: bootstrapError } = await supabase.rpc("bootstrap_admin_owner", {
  p_user_id: user.id,
  p_email: email,
  p_created_at: now,
});

if (bootstrapError) {
  fail(
    bootstrapError.message.startsWith("admin_bootstrap_already_completed")
      ? "bootstrap_owner_already_exists"
      : "bootstrap_member_insert_failed",
  );
}

console.log("bootstrap_owner_ready");

async function findAuthUserByEmail(targetEmail) {
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) {
      fail("bootstrap_auth_user_lookup_failed");
    }

    const match = data.users.find((candidate) => candidate.email?.trim().toLowerCase() === targetEmail);
    if (match) {
      return match;
    }
    if (data.users.length < 100) {
      return null;
    }
  }

  fail("bootstrap_auth_user_lookup_limit");
}

async function inviteAuthUser(targetEmail) {
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(targetEmail, { redirectTo });
  if (error || !data.user) {
    fail("bootstrap_invitation_failed");
  }
  return data.user;
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    fail(`missing_env:${name}`);
  }

  return value;
}

function requiredHttpsUrl(name) {
  const value = requiredEnv(name);

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.hostname !== "localhost") {
      fail(`invalid_env:${name}`);
    }
    return url.toString();
  } catch {
    fail(`invalid_env:${name}`);
  }
}

function normalizeEmail(value) {
  const normalized = value.trim().toLowerCase();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
    fail("invalid_env:ADMIN_BOOTSTRAP_EMAIL");
  }

  return normalized;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
