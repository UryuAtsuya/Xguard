import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { z } from "zod";

export interface VerifiedAdminIdentity {
  userId: string;
  email: string;
}

export interface AdminTokenVerifier {
  verify(token: string): Promise<VerifiedAdminIdentity | null>;
}

export class SupabaseAdminTokenVerifier implements AdminTokenVerifier {
  private readonly issuer: string;
  private readonly jwks: JWTVerifyGetKey;

  constructor(
    supabaseUrl: string,
    options: {
      jwks?: JWTVerifyGetKey;
    } = {},
  ) {
    const baseUrl = parseSupabaseUrl(supabaseUrl);
    this.issuer = new URL("/auth/v1", baseUrl).toString().replace(/\/$/, "");
    this.jwks =
      options.jwks ??
      createRemoteJWKSet(new URL("/auth/v1/.well-known/jwks.json", baseUrl));
  }

  async verify(token: string): Promise<VerifiedAdminIdentity | null> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: "authenticated",
      });
      const claims = z
        .object({
          sub: z.string().uuid(),
          email: z.string().email(),
        })
        .safeParse(payload);

      if (!claims.success) {
        return null;
      }

      return {
        userId: claims.data.sub,
        email: claims.data.email.trim().toLowerCase(),
      };
    } catch {
      return null;
    }
  }
}

export class RejectingAdminTokenVerifier implements AdminTokenVerifier {
  async verify(): Promise<null> {
    return null;
  }
}

function parseSupabaseUrl(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("invalid_runtime_env:SUPABASE_URL");
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.hostname !== "localhost") {
      throw new Error("invalid_runtime_env:SUPABASE_URL");
    }
    return url.toString();
  } catch {
    throw new Error("invalid_runtime_env:SUPABASE_URL");
  }
}
