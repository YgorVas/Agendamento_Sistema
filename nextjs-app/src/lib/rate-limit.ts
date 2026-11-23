import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";
import { env } from "./env";

const rules = {
  login: { limit: 30, seconds: 900 },
  "login-account": { limit: 20, seconds: 900 },
  registration: { limit: 10, seconds: 3600 },
  queue: { limit: 60, seconds: 900 },
  recovery: { limit: 15, seconds: 900 },
};

function clientAddress(request: Request) {
  const address = env.TRUSTED_CLIENT_IP_HEADER
    ? request.headers.get(env.TRUSTED_CLIENT_IP_HEADER)?.trim()
    : undefined;
  return address && isIP(address) ? address : "unknown";
}

export async function limitRequest(request: Request, action: keyof typeof rules, subject?: string) {
  const { limit, seconds } = rules[action];
  const key = createHmac("sha256", env.AUTH_SECRET)
    .update(JSON.stringify([action, subject ?? clientAddress(request)]))
    .digest("hex");

  try {
    const expires = sql`statement_timestamp() + ${seconds}::integer * interval '1 second'`;
    const expired = sql`${rateLimits.expiresAt} <= statement_timestamp()`;
    const [allowed] = await db.insert(rateLimits)
      .values({ key, attempts: 1, expiresAt: expires })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: {
          attempts: sql`CASE WHEN ${expired} THEN 1 ELSE ${rateLimits.attempts} + 1 END`,
          expiresAt: sql`CASE WHEN ${expired} THEN ${expires} ELSE ${rateLimits.expiresAt} END`,
        },
        setWhere: sql`${expired} OR ${rateLimits.attempts} < ${limit}`,
      })
      .returning({ key: rateLimits.key });

    if (allowed) return null;
  } catch (error) {
    console.error("Rate limit unavailable:", error instanceof Error ? error.name : "unknown error");
    return NextResponse.json({ erro: "Serviço temporariamente indisponível." }, { status: 503 });
  }

  return NextResponse.json(
    { erro: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
    { status: 429, headers: { "Retry-After": String(seconds), "Cache-Control": "no-store" } },
  );
}
