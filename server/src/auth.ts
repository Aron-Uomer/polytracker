import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { prisma, DB_ENABLED } from "./db.js";
import { resolvePlan, type Plan } from "./plans.js";
import { memEnsure, memGet, memGetByEmail, memIndexEmail } from "./memstore.js";

const SECRET = process.env.AUTH_SECRET ?? "dev-insecure-secret-change-me";
const TOKEN_TTL = "30d";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

export const googleEnabled = () => !!GOOGLE_CLIENT_ID;

if (!process.env.AUTH_SECRET) {
  // In production the fallback secret is public knowledge (it's in this repo),
  // so every JWT would be forgeable by anyone. Refuse to start rather than serve
  // a deployment whose sessions can be minted at will.
  if (process.env.NODE_ENV === "production") {
    console.error(
      "[auth] FATAL: AUTH_SECRET is not set. Set it to a long random string " +
        "(e.g. `openssl rand -hex 32`) — refusing to start in production with the public dev secret."
    );
    process.exit(1);
  }
  console.warn("[auth] AUTH_SECRET not set — using an insecure dev secret. Set it in production.");
}

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  plan: Plan;
  proExpiresAt: string | null;
}

export class AuthError extends Error {}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sign(userId: string): string {
  return jwt.sign({ sub: userId }, SECRET, { expiresIn: TOKEN_TTL });
}

/** Returns the userId encoded in a bearer token, or null if missing/invalid. */
export function verifyToken(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, SECRET) as { sub?: string };
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export async function register(
  emailRaw: string,
  password: string,
  name?: string
): Promise<{ user: AuthUser; token: string }> {
  const email = emailRaw.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new AuthError("Enter a valid email address.");
  if (password.length < 8) throw new AuthError("Password must be at least 8 characters.");

  const passwordHash = await bcrypt.hash(password, 10);

  if (DB_ENABLED) {
    // Any existing row for this email blocks registration — including one created
    // by Google sign-in, which has no passwordHash. Letting registration "adopt"
    // a password-less row would hand an account (and its plan) to anyone who
    // knows the address of a Google user. Matches the in-memory path below.
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new AuthError("An account with that email already exists.");
    const user = await prisma.user.create({
      data: { email, name: name ?? null, passwordHash, plan: "free" },
    });
    return { user: toAuthUser(user), token: sign(user.id) };
  }

  if (memGetByEmail(email)) throw new AuthError("An account with that email already exists.");
  const acct = memEnsure(`mem_${Math.random().toString(36).slice(2)}`);
  acct.email = email;
  acct.name = name ?? null;
  acct.passwordHash = passwordHash;
  memIndexEmail(acct);
  return { user: toAuthUser(acct), token: sign(acct.id) };
}

export async function login(
  emailRaw: string,
  password: string
): Promise<{ user: AuthUser; token: string }> {
  const email = emailRaw.trim().toLowerCase();

  if (DB_ENABLED) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new AuthError("Incorrect email or password.");
    }
    return { user: toAuthUser(user), token: sign(user.id) };
  }

  const acct = memGetByEmail(email);
  if (!acct?.passwordHash || !(await bcrypt.compare(password, acct.passwordHash))) {
    throw new AuthError("Incorrect email or password.");
  }
  return { user: toAuthUser(acct), token: sign(acct.id) };
}

/**
 * Sign in (or sign up) with a Google ID token. Verified with google-auth-library,
 * then upserted by email — no password. Links to an existing same-email account.
 */
export async function loginWithGoogle(
  idToken: string
): Promise<{ user: AuthUser; token: string }> {
  if (!googleClient || !GOOGLE_CLIENT_ID) {
    throw new AuthError("Google sign-in isn't configured.");
  }
  let email: string | undefined;
  let name: string | null = null;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (payload?.email && payload.email_verified) {
      email = payload.email.toLowerCase();
      name = payload.name ?? null;
    }
  } catch {
    throw new AuthError("Google sign-in failed. Please try again.");
  }
  if (!email) throw new AuthError("Your Google account has no verified email.");

  if (DB_ENABLED) {
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, name, plan: "free" },
      update: { name: name ?? undefined },
    });
    return { user: toAuthUser(user), token: sign(user.id) };
  }

  let acct = memGetByEmail(email);
  if (!acct) {
    acct = memEnsure(`mem_${Math.random().toString(36).slice(2)}`);
    acct.email = email;
    acct.name = name;
    memIndexEmail(acct);
  } else if (name && !acct.name) {
    acct.name = name;
  }
  return { user: toAuthUser(acct), token: sign(acct.id) };
}

/** Resolve the AuthUser for a verified token's userId (null if it's anonymous).
 *  A real account is any user with an email (password- or Google-based); an
 *  anonymous x-client-id user has no email. */
export async function getAuthUser(userId: string): Promise<AuthUser | null> {
  if (DB_ENABLED) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    return user?.email ? toAuthUser(user) : null;
  }
  const acct = memGet(userId);
  return acct?.email ? toAuthUser(acct) : null;
}

function toAuthUser(u: {
  id: string;
  email: string | null;
  name: string | null;
  plan: string;
  proExpiresAt?: Date | number | null;
}): AuthUser {
  const eff = resolvePlan(u.plan as Plan, u.proExpiresAt ?? null);
  const iso =
    u.proExpiresAt == null
      ? null
      : (u.proExpiresAt instanceof Date ? u.proExpiresAt : new Date(u.proExpiresAt)).toISOString();
  return {
    id: u.id,
    email: u.email ?? "",
    name: u.name,
    plan: eff,
    proExpiresAt: eff === "pro" ? iso : null,
  };
}
