export interface RuntimeConfig {
  nodeEnv: string;
  port: number;
  pricingConfirmed: boolean;
  complianceConfirmed: boolean;
  appBaseUrl?: string;
  corsAllowedOrigins?: string[];
  xOAuth: XOAuthRuntimeConfig;
  oauthStateTtlSeconds: number;
  oauthPkceVerifierBytes: number;
  oauthStatusExposure: OAuthStatusExposure;
  oauthStatusDiagnosticToken?: string;
  oauthStateRepository: OAuthStateRepositoryMode;
  contentComplianceEventRepository: ContentComplianceEventRepositoryMode;
}

export type OAuthStatusExposure = "disabled" | "deployment_diagnostic";
export type OAuthStateRepositoryMode = "memory" | "supabase";
export type ContentComplianceEventRepositoryMode = "memory" | "supabase";

export type XOAuthRuntimeConfig =
  | {
      mode: "configured";
      clientId: string;
      callbackUrl: string;
      clientSecretConfigured: boolean;
    }
  | {
      mode: "mock";
      clientId: "mock";
      callbackUrl: string;
      clientSecretConfigured: false;
      missingEnv: string[];
    };

export function createRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const nodeEnv = env.NODE_ENV?.trim() || "development";
  const pricingConfirmed = env.PRICING_CONFIRMED?.trim() === "true";
  const complianceConfirmed = env.COMPLIANCE_CONFIRMED?.trim() === "true";

  if (nodeEnv === "production" && !pricingConfirmed) {
    throw new Error("invalid_runtime_env:PRICING_CONFIRMED");
  }

  if (nodeEnv === "production" && !complianceConfirmed) {
    throw new Error("invalid_runtime_env:COMPLIANCE_CONFIRMED");
  }

  const port = parsePort(env.PORT);
  const appBaseUrl = parseOptionalUrl("APP_BASE_URL", env.APP_BASE_URL);
  const corsAllowedOrigins = parseCorsAllowedOrigins(env.CORS_ORIGINS, appBaseUrl, nodeEnv);
  const fallbackCallbackUrl = joinUrlPath(appBaseUrl ?? `http://localhost:${port}`, "/api/x/oauth/callback");
  const callbackUrl = parseOptionalUrl("X_CALLBACK_URL", env.X_CALLBACK_URL) ?? fallbackCallbackUrl;
  const clientId = env.X_CLIENT_ID?.trim();
  const clientSecret = env.X_CLIENT_SECRET?.trim();
  const oauthStateTtlSeconds = parsePositiveInteger(env.OAUTH_STATE_TTL_SECONDS, 300, "OAUTH_STATE_TTL_SECONDS");
  const oauthPkceVerifierBytes = parseBoundedInteger(env.OAUTH_PKCE_VERIFIER_BYTES, 64, 32, 96, "OAUTH_PKCE_VERIFIER_BYTES");
  const oauthStatusExposure = parseOAuthStatusExposure(env.X_OAUTH_STATUS_EXPOSURE);
  const oauthStatusDiagnosticToken = env.X_OAUTH_STATUS_DIAGNOSTIC_TOKEN?.trim() || undefined;
  const oauthStateRepository = parseOAuthStateRepository(env.OAUTH_STATE_REPOSITORY);
  const contentComplianceEventRepository = parseContentComplianceEventRepository(
    env.CONTENT_COMPLIANCE_EVENT_REPOSITORY,
  );

  if (nodeEnv === "production" && !env.OAUTH_STATE_REPOSITORY?.trim()) {
    throw new Error("invalid_runtime_env:OAUTH_STATE_REPOSITORY");
  }

  if (nodeEnv === "production" && !env.CONTENT_COMPLIANCE_EVENT_REPOSITORY?.trim()) {
    throw new Error("invalid_runtime_env:CONTENT_COMPLIANCE_EVENT_REPOSITORY");
  }

  if (
    oauthStatusExposure === "deployment_diagnostic" &&
    (!oauthStatusDiagnosticToken || Buffer.byteLength(oauthStatusDiagnosticToken) < 32)
  ) {
    throw new Error("invalid_runtime_env:X_OAUTH_STATUS_DIAGNOSTIC_TOKEN");
  }

  if (nodeEnv === "production" && !clientId) {
    throw new Error("invalid_runtime_env:X_CLIENT_ID");
  }

  if (nodeEnv === "production" && !clientSecret) {
    throw new Error("invalid_runtime_env:X_CLIENT_SECRET");
  }

  if (nodeEnv === "production" && !isSecurePublicUrl(callbackUrl)) {
    throw new Error("invalid_runtime_env:X_CALLBACK_URL");
  }

  if (!clientId) {
    return {
      nodeEnv,
      port,
      pricingConfirmed,
      complianceConfirmed,
      appBaseUrl,
      corsAllowedOrigins,
      oauthStateTtlSeconds,
      oauthPkceVerifierBytes,
      oauthStatusExposure,
      oauthStatusDiagnosticToken,
      oauthStateRepository,
      contentComplianceEventRepository,
      xOAuth: {
        mode: "mock",
        clientId: "mock",
        callbackUrl,
        clientSecretConfigured: false,
        missingEnv: ["X_CLIENT_ID"],
      },
    };
  }

  return {
    nodeEnv,
    port,
    pricingConfirmed,
    complianceConfirmed,
    appBaseUrl,
    corsAllowedOrigins,
    oauthStateTtlSeconds,
    oauthPkceVerifierBytes,
    oauthStatusExposure,
    oauthStatusDiagnosticToken,
    oauthStateRepository,
    contentComplianceEventRepository,
    xOAuth: {
      mode: "configured",
      clientId,
      callbackUrl,
      clientSecretConfigured: Boolean(clientSecret),
    },
  };
}

function parseOAuthStateRepository(value: string | undefined): OAuthStateRepositoryMode {
  const trimmed = value?.trim();

  if (!trimmed) {
    return "memory";
  }

  if (trimmed === "memory" || trimmed === "supabase") {
    return trimmed;
  }

  throw new Error("invalid_runtime_env:OAUTH_STATE_REPOSITORY");
}

function parseContentComplianceEventRepository(value: string | undefined): ContentComplianceEventRepositoryMode {
  const trimmed = value?.trim();

  if (!trimmed) {
    return "memory";
  }

  if (trimmed === "memory" || trimmed === "supabase") {
    return trimmed;
  }

  throw new Error("invalid_runtime_env:CONTENT_COMPLIANCE_EVENT_REPOSITORY");
}

function parsePositiveInteger(value: string | undefined, defaultValue: number, fieldName: string): number {
  const trimmed = value?.trim();

  if (!trimmed) {
    return defaultValue;
  }

  const parsed = Number(trimmed);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`invalid_runtime_env:${fieldName}`);
  }

  return parsed;
}

function parseBoundedInteger(
  value: string | undefined,
  defaultValue: number,
  min: number,
  max: number,
  fieldName: string,
): number {
  const parsed = parsePositiveInteger(value, defaultValue, fieldName);

  if (parsed < min || parsed > max) {
    throw new Error(`invalid_runtime_env:${fieldName}`);
  }

  return parsed;
}

function parseOAuthStatusExposure(value: string | undefined): OAuthStatusExposure {
  const trimmed = value?.trim();

  if (!trimmed) {
    return "disabled";
  }

  if (trimmed === "disabled" || trimmed === "deployment_diagnostic") {
    return trimmed;
  }

  throw new Error("invalid_runtime_env:X_OAUTH_STATUS_EXPOSURE");
}

function parseCorsAllowedOrigins(
  value: string | undefined,
  appBaseUrl: string | undefined,
  nodeEnv: string,
): string[] | undefined {
  const explicitOrigins = value
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (explicitOrigins?.length) {
    return explicitOrigins.map((origin) => parseUrlOrigin("CORS_ORIGINS", origin));
  }

  if (nodeEnv === "production") {
    return appBaseUrl ? [parseUrlOrigin("APP_BASE_URL", appBaseUrl)] : [];
  }

  return undefined;
}

function parsePort(value: string | undefined): number {
  if (!value) {
    return 4000;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("invalid_runtime_env:PORT");
  }

  return port;
}

function parseOptionalUrl(fieldName: string, value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    return new URL(trimmed).toString();
  } catch {
    throw new Error(`invalid_runtime_env:${fieldName}`);
  }
}

function parseUrlOrigin(fieldName: string, value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    throw new Error(`invalid_runtime_env:${fieldName}`);
  }
}

function isSecurePublicUrl(value: string): boolean {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
  const isIpv4Loopback = /^127(?:\.\d{1,3}){3}$/.test(hostname);
  const isIpv4MappedLoopback =
    /^::ffff:127(?:\.\d{1,3}){3}$/.test(hostname) || /^::ffff:7f[0-9a-f]{2}:/.test(hostname);
  const isLoopback = hostname === "localhost" || hostname === "::1" || isIpv4Loopback || isIpv4MappedLoopback;
  return url.protocol === "https:" && !isLoopback;
}

function joinUrlPath(baseUrl: string, path: string): string {
  const url = new URL(baseUrl);
  url.pathname = [url.pathname.replace(/\/+$/, ""), path.replace(/^\/+/, "")].filter(Boolean).join("/");
  return url.toString();
}
