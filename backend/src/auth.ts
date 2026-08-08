import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";

import type { EventStore, UserRow } from "./database.js";
import { ApiError } from "./errors.js";

const TOKEN_LIFETIME_SECONDS = 24 * 60 * 60;

export class AuthService {
  private readonly jwtKey: Uint8Array;

  constructor(
    private readonly store: EventStore,
    jwtSecret: string,
  ) {
    if (jwtSecret.length < 32) {
      throw new Error("JWT_SECRET must be at least 32 characters");
    }
    this.jwtKey = new TextEncoder().encode(jwtSecret);
  }

  async register(input: { name: string; email: string; password: string }) {
    const user = await this.store.createUser({
      id: `usr_${randomUUID()}`,
      name: input.name.trim(),
      email: normalizeEmail(input.email),
      passwordHash: await hashPassword(input.password),
    });
    if (!user) {
      throw new ApiError(
        409,
        "AUTH_EMAIL_ALREADY_EXISTS",
        "指定されたメールアドレスは既に登録されています。",
      );
    }
    return {
      token: await this.issueToken(user.id),
      user: await this.profile(user),
    };
  }

  async login(input: { email: string; password: string }) {
    const user = await this.store.findUserByEmail(normalizeEmail(input.email));
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new ApiError(
        401,
        "AUTH_INVALID_CREDENTIALS",
        "メールアドレスまたはパスワードが正しくありません。",
      );
    }
    return {
      token: await this.issueToken(user.id),
      user: await this.profile(user),
    };
  }

  async me(authorization: string | undefined) {
    const { userId } = await this.authenticate(authorization);
    const user = await this.store.findUserById(userId);
    if (!user) throw unauthorized();
    return { user: await this.profile(user) };
  }

  async logout(authorization: string | undefined) {
    const { sessionId } = await this.authenticate(authorization);
    await this.store.revokeAuthSession(sessionId);
  }

  private async issueToken(userId: string) {
    const { SignJWT } = await import("jose");
    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + TOKEN_LIFETIME_SECONDS * 1_000);
    await this.store.createAuthSession({ id: sessionId, userId, expiresAt });
    return new SignJWT({})
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(userId)
      .setJti(sessionId)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1_000))
      .sign(this.jwtKey);
  }

  async authenticate(authorization: string | undefined) {
    if (!authorization?.startsWith("Bearer ")) throw unauthorized();
    const { errors: joseErrors, jwtVerify } = await import("jose");
    try {
      const result = await jwtVerify(
        authorization.slice("Bearer ".length),
        this.jwtKey,
        { algorithms: ["HS256"] },
      );
      const userId = result.payload.sub;
      const sessionId = result.payload.jti;
      if (!userId || !sessionId) throw unauthorized();
      const session = await this.store.findAuthSession(sessionId);
      if (
        !session ||
        session.userId !== userId ||
        session.revokedAt ||
        session.expiresAt.getTime() <= Date.now()
      ) {
        throw unauthorized();
      }
      return { userId, sessionId };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof joseErrors.JWTExpired) {
        throw new ApiError(
          401,
          "AUTH_TOKEN_EXPIRED",
          "認証トークンの有効期限が切れています。",
        );
      }
      throw unauthorized();
    }
  }

  private async profile(user: UserRow) {
    return {
      id: user.id,
      name: user.name,
      avatarUrl: user.avatarUrl,
      visitedEvents: await this.store.listVisitedEvents(user.id),
    };
  }
}

export async function ensureDevelopmentUser(store: EventStore) {
  const email = "dev@spajam.jp";
  if (await store.findUserByEmail(email)) return;
  await store.createUser({
    id: "usr_spajam2026",
    name: "山田 太郎",
    email,
    passwordHash: await hashPassword("demo1234"),
  });
}

function unauthorized() {
  return new ApiError(401, "AUTH_UNAUTHORIZED", "認証が必要です。");
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt);
  return `scrypt$${salt.toString("base64url")}$${derivedKey.toString("base64url")}`;
}

async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, saltValue, hashValue] = storedHash.split("$");
  if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
  try {
    const expected = Buffer.from(hashValue, "base64url");
    const actual = await scrypt(password, Buffer.from(saltValue, "base64url"));
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  } catch {
    return false;
  }
}

function scrypt(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, 64, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}
