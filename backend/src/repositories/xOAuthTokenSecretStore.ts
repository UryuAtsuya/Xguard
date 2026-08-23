import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { parse, resolve } from "node:path";
import { assertReadOnlyXScopes } from "./tokenRepository.js";

export interface XOAuthTokenSecret {
  accessToken: string;
  refreshToken?: string;
  scope: string[];
  expiresAt?: string;
}

export interface SaveXOAuthTokenSecretInput extends XOAuthTokenSecret {
  xAccountId: string;
}

export interface XOAuthTokenSecretRefs {
  accessTokenRef: string;
  refreshTokenRef?: string;
}

export interface XOAuthTokenSecretStore {
  save(input: SaveXOAuthTokenSecretInput): Promise<XOAuthTokenSecretRefs>;
  load(xAccountId: string): Promise<XOAuthTokenSecret | null>;
}

interface EncryptedTokenEnvelope {
  version: 1;
  iv: string;
  authTag: string;
  ciphertext: string;
}

export class EncryptedFileXOAuthTokenSecretStore implements XOAuthTokenSecretStore {
  private readonly directory: string;
  private readonly encryptionKey: Buffer;

  constructor(options: { directory: string; encryptionKey: string }) {
    const directory = options.directory.trim();
    if (!directory) {
      throw new Error("invalid_runtime_env:X_TOKEN_SECRET_STORE_DIR");
    }

    this.directory = validateDedicatedDirectory(directory);
    this.encryptionKey = decodeEncryptionKey(options.encryptionKey);
  }

  async save(input: SaveXOAuthTokenSecretInput): Promise<XOAuthTokenSecretRefs> {
    assertReadOnlyXScopes(input.scope);
    requireSecret("access_token", input.accessToken);
    if (input.refreshToken !== undefined) {
      requireSecret("refresh_token", input.refreshToken);
    }

    const digest = accountDigest(input.xAccountId);
    const finalPath = resolve(this.directory, `${digest}.json`);
    const temporaryPath = resolve(this.directory, `.${digest}.${randomUUID()}.tmp`);

    try {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      await chmod(this.directory, 0o700);
      const envelope = encryptTokenSecret(
        {
          accessToken: input.accessToken,
          refreshToken: input.refreshToken,
          scope: [...input.scope],
          expiresAt: input.expiresAt,
        },
        input.xAccountId,
        this.encryptionKey,
      );
      await writeFile(temporaryPath, JSON.stringify(envelope), { encoding: "utf8", flag: "wx", mode: 0o600 });
      await rename(temporaryPath, finalPath);
      await chmod(finalPath, 0o600);
    } catch {
      throw new Error("x_token_secret_write_failed");
    }

    const referenceBase = `xguard-secret://x-oauth/${digest}`;
    return {
      accessTokenRef: `${referenceBase}/access`,
      refreshTokenRef: input.refreshToken ? `${referenceBase}/refresh` : undefined,
    };
  }

  async load(xAccountId: string): Promise<XOAuthTokenSecret | null> {
    const path = resolve(this.directory, `${accountDigest(xAccountId)}.json`);

    let serialized: string;
    try {
      serialized = await readFile(path, "utf8");
    } catch (error) {
      if (isMissingFileError(error)) {
        return null;
      }
      throw new Error("x_token_secret_read_failed");
    }

    try {
      const envelope = parseEnvelope(JSON.parse(serialized));
      const secret = decryptTokenSecret(envelope, xAccountId, this.encryptionKey);
      assertReadOnlyXScopes(secret.scope);
      requireSecret("access_token", secret.accessToken);
      return secret;
    } catch {
      throw new Error("x_token_secret_read_failed");
    }
  }
}

function decodeEncryptionKey(value: string): Buffer {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) {
    throw new Error("invalid_runtime_env:X_TOKEN_ENCRYPTION_KEY");
  }

  const key = Buffer.from(trimmed, "base64");
  if (key.byteLength !== 32) {
    throw new Error("invalid_runtime_env:X_TOKEN_ENCRYPTION_KEY");
  }

  return key;
}

function validateDedicatedDirectory(value: string): string {
  const directory = resolve(value);
  const broadDirectories = new Set([
    parse(directory).root,
    resolve(homedir()),
    resolve(process.cwd()),
    resolve(tmpdir()),
  ]);
  if (broadDirectories.has(directory)) {
    throw new Error("invalid_runtime_env:X_TOKEN_SECRET_STORE_DIR");
  }
  return directory;
}

function encryptTokenSecret(
  secret: XOAuthTokenSecret,
  xAccountId: string,
  encryptionKey: Buffer,
): EncryptedTokenEnvelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  cipher.setAAD(Buffer.from(`xguard:x-oauth:${xAccountId}`, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(secret), "utf8"),
    cipher.final(),
  ]);

  return {
    version: 1,
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

function decryptTokenSecret(
  envelope: EncryptedTokenEnvelope,
  xAccountId: string,
  encryptionKey: Buffer,
): XOAuthTokenSecret {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey, Buffer.from(envelope.iv, "base64"));
  decipher.setAAD(Buffer.from(`xguard:x-oauth:${xAccountId}`, "utf8"));
  decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  const value = JSON.parse(plaintext) as Partial<XOAuthTokenSecret>;

  if (
    typeof value.accessToken !== "string" ||
    !Array.isArray(value.scope) ||
    !value.scope.every((scope) => typeof scope === "string") ||
    (value.refreshToken !== undefined && typeof value.refreshToken !== "string") ||
    (value.expiresAt !== undefined && typeof value.expiresAt !== "string")
  ) {
    throw new Error("invalid_token_secret");
  }

  return {
    accessToken: value.accessToken,
    refreshToken: value.refreshToken,
    scope: value.scope,
    expiresAt: value.expiresAt,
  };
}

function parseEnvelope(value: unknown): EncryptedTokenEnvelope {
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 1 ||
    !("iv" in value) ||
    typeof value.iv !== "string" ||
    !("authTag" in value) ||
    typeof value.authTag !== "string" ||
    !("ciphertext" in value) ||
    typeof value.ciphertext !== "string"
  ) {
    throw new Error("invalid_token_envelope");
  }

  return value as EncryptedTokenEnvelope;
}

function accountDigest(xAccountId: string): string {
  const trimmed = xAccountId.trim();
  if (!trimmed) {
    throw new Error("invalid_x_account_id");
  }

  return createHash("sha256").update(trimmed).digest("hex");
}

function requireSecret(name: string, value: string): void {
  if (!value.trim()) {
    throw new Error(`invalid_${name}`);
  }
}

function isMissingFileError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
