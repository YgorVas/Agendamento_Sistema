import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { companies, users, userCompanies } from "@/db/schema";
import { env } from "./env";

const ISSUER = "agendamento";
const ACCESS_AUDIENCE = "acesso-comercio";
const SELECT_AUDIENCE = "selecionar-comercio";
const ACCESS_TTL = "1h";
const SELECT_TTL = "5m";

export type TokenPayload = {
  userId: number;
  sessionVersion?: number;
  companyId: number;
  role: "ADMIN" | "GERENTE" | "CAIXA";
};

export type SelectionPayload = {
  userId: number;
  sessionVersion?: number;
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

const dummyHash = bcrypt.hashSync("credencial-inexistente", 12);
export async function safeVerifyPassword(password: string, hash?: string | null) {
  return bcrypt.compare(password, hash ?? dummyHash);
}

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.AUTH_SECRET, {
    algorithm: "HS256",
    issuer: ISSUER,
    audience: ACCESS_AUDIENCE,
    expiresIn: ACCESS_TTL,
  });
}

export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.AUTH_SECRET, {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: ACCESS_AUDIENCE,
    });
    if (
      typeof decoded !== "object" ||
      !decoded.userId ||
      !decoded.companyId ||
      !decoded.role
    ) {
      return null;
    }
    return decoded as TokenPayload;
  } catch {
    return null;
  }
}

export function signSelectionToken(payload: SelectionPayload): string {
  return jwt.sign(payload, env.AUTH_SECRET, {
    algorithm: "HS256",
    issuer: ISSUER,
    audience: SELECT_AUDIENCE,
    expiresIn: SELECT_TTL,
  });
}

export function verifySelectionToken(token: string): SelectionPayload | null {
  try {
    const decoded = jwt.verify(token, env.AUTH_SECRET, {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: SELECT_AUDIENCE,
    });
    if (typeof decoded !== "object" || !decoded.userId) {
      return null;
    }
    return decoded as SelectionPayload;
  } catch {
    return null;
  }
}

export function getCookieValue(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?.[1];
}

export function getBearerToken(request: Request): string | undefined {
  const auth = request.headers.get("authorization");
  if (!auth) return undefined;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
}

export async function requireAuth(
  request: Request
): Promise<TokenPayload & { userName: string }> {
  const token =
    getBearerToken(request) ?? getCookieValue(request, "auth-token");
  if (!token) {
    throw new ResponseError("Unauthorized", 401);
  }
  const payload = verifyAccessToken(token);
  if (!payload) {
    throw new ResponseError("Unauthorized", 401);
  }
  const [membership] = await db.select({ role: userCompanies.role, userName: users.name })
    .from(userCompanies)
    .innerJoin(users, eq(users.id, userCompanies.userId))
    .innerJoin(companies, eq(companies.id, userCompanies.companyId))
    .where(and(
      eq(users.id, payload.userId),
      eq(users.sessionVersion, payload.sessionVersion ?? 0),
      eq(companies.id, payload.companyId),
      eq(companies.active, true),
    ));
  if (!membership || membership.role !== payload.role) {
    throw new ResponseError("Acesso indisponível. Entre novamente.", 401);
  }
  return { ...payload, userName: membership.userName };
}

export async function requireManagement(request: Request): Promise<TokenPayload> {
  const auth = await requireAuth(request);
  if (auth.role !== "ADMIN" && auth.role !== "GERENTE") {
    throw new ResponseError("Esta operação exige um cargo de gestão.", 403);
  }
  return auth;
}

export class ResponseError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
  }
}
