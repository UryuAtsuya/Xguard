export interface RuntimeConfig {
  nodeEnv: string;
  port: number;
  appBaseUrl?: string;
  corsAllowedOrigins?: string[];
  xOAuth: XOAuthRuntimeConfig;
  oauthStateTtlSeconds: number;
  oauthPkceVerifierBytes: number;
  oauthStatusExposure: OAuthStatusExposure;
  oauthStatusDiagnosticToken?: string;
}

export type OAuthStatusExposure = "disabled" | "deployment_diagnostic";

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

  if (
    oauthStatusExposure === "deployment_diagnostic" &&
    (!oauthStatusDiagnosticToken || Buffer.byteLength(oauthStatusDiagnosticToken) < 32)
  ) {
    throw new Error("invalid_runtime_env:X_OAUTH_STATUS_DIAGNOSTIC_TOKEN");
  }

  if (!clientId) {
    return {
      nodeEnv,
      port,
      appBaseUrl,
      corsAllowedOrigins,
      oauthStateTtlSeconds,
      oauthPkceVerifierBytes,
      oauthStatusExposure,
      oauthStatusDiagnosticToken,
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
    appBaseUrl,
    corsAllowedOrigins,
    oauthStateTtlSeconds,
    oauthPkceVerifierBytes,
    oauthStatusExposure,
    oauthStatusDiagnosticToken,
    xOAuth: {
      mode: "configured",
      clientId,
      callbackUrl,
      clientSecretConfigured: Boolean(clientSecret),
    },
  };
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

function joinUrlPath(baseUrl: string, path: string): string {
  const url = new URL(baseUrl);
  url.pathname = [url.pathname.replace(/\/+$/, ""), path.replace(/^\/+/, "")].filter(Boolean).join("/");
  return url.toString();
}
