export interface RuntimeConfig {
  port: number;
  appBaseUrl?: string;
  xOAuth: XOAuthRuntimeConfig;
}

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
  const port = parsePort(env.PORT);
  const appBaseUrl = parseOptionalUrl("APP_BASE_URL", env.APP_BASE_URL);
  const fallbackCallbackUrl = joinUrlPath(appBaseUrl ?? `http://localhost:${port}`, "/api/x/oauth/callback");
  const callbackUrl = parseOptionalUrl("X_CALLBACK_URL", env.X_CALLBACK_URL) ?? fallbackCallbackUrl;
  const clientId = env.X_CLIENT_ID?.trim();
  const clientSecret = env.X_CLIENT_SECRET?.trim();

  if (!clientId) {
    return {
      port,
      appBaseUrl,
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
    port,
    appBaseUrl,
    xOAuth: {
      mode: "configured",
      clientId,
      callbackUrl,
      clientSecretConfigured: Boolean(clientSecret),
    },
  };
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

function joinUrlPath(baseUrl: string, path: string): string {
  const url = new URL(baseUrl);
  url.pathname = [url.pathname.replace(/\/+$/, ""), path.replace(/^\/+/, "")].filter(Boolean).join("/");
  return url.toString();
}
