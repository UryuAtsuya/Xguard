import { isIP } from "node:net";

const target = process.argv[2];

try {
  if (target !== "customer" && target !== "admin") {
    throw new Error("usage: node scripts/sites-build-preflight.mjs <customer|admin>");
  }

  requirePublicBaseUrl("VITE_XGUARD_API_BASE_URL", process.env.VITE_XGUARD_API_BASE_URL);
  rejectBackendSecrets(process.env);

  if (target === "admin") {
    requirePublicBaseUrl("VITE_SUPABASE_URL", process.env.VITE_SUPABASE_URL);
    requirePublishableKey(process.env.VITE_SUPABASE_PUBLISHABLE_KEY);
    requireAdminRedirect(process.env.VITE_ADMIN_REDIRECT_URL);
  }

  process.stdout.write(`sites_${target}_environment_verified\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "sites_environment_invalid"}\n`);
  process.exitCode = 1;
}

function requirePublicBaseUrl(name, value) {
  const url = parseRequiredUrl(name, value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    isPrivateHostname(url.hostname)
  ) {
    throw new Error(`invalid_sites_env:${name}`);
  }
}

function requireAdminRedirect(value) {
  const name = "VITE_ADMIN_REDIRECT_URL";
  const url = parseRequiredUrl(name, value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/auth/callback" ||
    url.search ||
    url.hash ||
    isPrivateHostname(url.hostname)
  ) {
    throw new Error(`invalid_sites_env:${name}`);
  }
}

function requirePublishableKey(value) {
  const name = "VITE_SUPABASE_PUBLISHABLE_KEY";
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`missing_sites_env:${name}`);
  }
  if (trimmed.length < 16 || /\s/.test(trimmed) || looksLikeServiceRoleKey(trimmed)) {
    throw new Error(`invalid_sites_env:${name}`);
  }
}

function rejectBackendSecrets(environment) {
  for (const name of ["SUPABASE_SERVICE_ROLE_KEY", "VITE_SUPABASE_SERVICE_ROLE_KEY"]) {
    if (environment[name]?.trim()) {
      throw new Error(`forbidden_sites_env:${name}`);
    }
  }
}

function looksLikeServiceRoleKey(value) {
  const normalized = value.toLowerCase();
  if (normalized.startsWith("sb_secret_") || normalized.includes("service_role")) {
    return true;
  }

  const jwtParts = value.split(".");
  if (jwtParts.length !== 3) {
    return false;
  }
  try {
    const payload = JSON.parse(Buffer.from(jwtParts[1], "base64url").toString("utf8"));
    return payload?.role === "service_role";
  } catch {
    return false;
  }
}

function parseRequiredUrl(name, value) {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`missing_sites_env:${name}`);
  }

  try {
    return new URL(trimmed);
  } catch {
    throw new Error(`invalid_sites_env:${name}`);
  }
}

function isPrivateHostname(value) {
  const hostname = value.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    return true;
  }

  const addressType = isIP(hostname);
  if (addressType === 4) {
    const [first, second] = hostname.split(".").map(Number);
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    );
  }
  if (addressType === 6) {
    return (
      hostname === "::" ||
      hostname === "::1" ||
      hostname.startsWith("fc") ||
      hostname.startsWith("fd") ||
      /^fe[89ab]/.test(hostname) ||
      hostname.startsWith("::ffff:")
    );
  }
  return false;
}
