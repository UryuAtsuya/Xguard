// @vitest-environment node
import { randomUUID } from "node:crypto";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
} from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { SupabaseAdminTokenVerifier } from "../admin/adminAuth.js";

const issuer = "https://project.supabase.co/auth/v1";
let verifier: SupabaseAdminTokenVerifier;
let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];

beforeAll(async () => {
  const keyPair = await generateKeyPair("ES256");
  privateKey = keyPair.privateKey;
  const publicJwk = await exportJWK(keyPair.publicKey);
  verifier = new SupabaseAdminTokenVerifier("https://project.supabase.co", {
    jwks: createLocalJWKSet({
      keys: [{ ...publicJwk, kid: "admin-auth-test", alg: "ES256", use: "sig" }],
    }),
  });
});

describe("Supabase admin JWT verification", () => {
  it("accepts a signed, unexpired authenticated token with normalized email", async () => {
    const userId = randomUUID();
    const token = await tokenFor({
      sub: userId,
      email: "Owner@Example.COM",
      issuer,
      audience: "authenticated",
      expiresIn: "5m",
    });

    await expect(verifier.verify(token)).resolves.toEqual({
      userId,
      email: "owner@example.com",
    });
  });

  it.each([
    { issuer: "https://attacker.example.com/auth/v1", audience: "authenticated", expiresIn: "5m" },
    { issuer, audience: "anon", expiresIn: "5m" },
    { issuer, audience: "authenticated", expiresIn: "-1s" },
  ])("rejects invalid issuer, audience, or expiration", async (claims) => {
    const token = await tokenFor({
      sub: randomUUID(),
      email: "owner@example.com",
      ...claims,
    });
    await expect(verifier.verify(token)).resolves.toBeNull();
  });
});

async function tokenFor(input: {
  sub: string;
  email: string;
  issuer: string;
  audience: string;
  expiresIn: string;
}) {
  return new SignJWT({ email: input.email })
    .setProtectedHeader({ alg: "ES256", kid: "admin-auth-test" })
    .setSubject(input.sub)
    .setIssuer(input.issuer)
    .setAudience(input.audience)
    .setIssuedAt()
    .setExpirationTime(input.expiresIn)
    .sign(privateKey);
}
