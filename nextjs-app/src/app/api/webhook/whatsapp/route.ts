export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { appointments, companies, customers } from "@/db/schema";
import { phoneVariants } from "@/lib/phone";
import { todaySPString, parseISODate } from "@/lib/date";
import { env } from "@/lib/env";
import { createHmac, timingSafeEqual } from "crypto";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode && token) {
    if (mode === "subscribe" && token === env.WEBHOOK_VERIFY_TOKEN) {
      return new NextResponse(challenge, { status: 200 });
    }
    return new NextResponse(null, { status: 403 });
  }
  return new NextResponse(null, { status: 400 });
}

export async function POST(request: Request) {
  const {
    WHATSAPP_APP_SECRET: secret,
    WHATSAPP_ACCESS_TOKEN: accessToken,
    WHATSAPP_PHONE_NUMBER_ID: phoneId,
    WHATSAPP_COMPANY_ID: companyIdStr,
    PUBLIC_BASE_URL: baseUrl,
    WHATSAPP_API_VERSION: version,
  } = env;

  if (
    !secret ||
    !accessToken ||
    !phoneId ||
    !/^\d+$/.test(companyIdStr || "") ||
    !baseUrl ||
    !/^v\d+\.\d+$/.test(version || "")
  ) {
    return new NextResponse(null, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256") || "";
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");

  if (
    !/^sha256=[0-9a-f]{64}$/.test(signature) ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return new NextResponse(null, { status: 403 });
  }

  const url = new URL("/fila", baseUrl);
  url.searchParams.set("empresa", companyIdStr!);

  const companyId = Number(companyIdStr);
  const today = parseISODate(todaySPString());

  try {
    const body = JSON.parse(rawBody);
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.value?.metadata?.phone_number_id !== phoneId) continue;
        for (const message of change.value.messages || []) {
          if (message.type !== "text" || !/^\d{10,15}$/.test(message.from || "")) continue;

          const variants = phoneVariants(message.from);
          const [row] = await db
            .select({
              position: appointments.position,
              status: appointments.status,
            })
            .from(appointments)
            .innerJoin(customers, eq(appointments.customerId, customers.id))
            .innerJoin(companies, eq(appointments.companyId, companies.id))
            .where(
              and(
                eq(appointments.companyId, companyId),
                eq(appointments.attendanceDate, today),
                inArray(appointments.status, ["agendado", "confirmado"]),
                phoneInVariantsSql(customers.phone, message.from)
              )
            )
            .orderBy(sql`${appointments.id} DESC`)
            .limit(1);

          const peopleAhead = row
            ? await db
                .select({ count: sql<number>`count(*)::int` })
                .from(appointments)
                .where(
                  and(
                    eq(appointments.companyId, companyId),
                    eq(appointments.attendanceDate, today),
                    sql`${appointments.position} < ${row.position}`,
                    inArray(appointments.status, ["agendado", "confirmado"])
                  )
                )
            : [{ count: 0 }];

          const text = row
            ? `Sua senha é ${row.position}. ${
                row.status === "confirmado"
                  ? "Seu atendimento está em andamento."
                  : `Há ${peopleAhead[0].count} pessoa(s) à sua frente.`
              }\nPara entrar na fila: ${url.toString()}`
            : `Para se registrar e entrar na fila, acesse: ${url.toString()}\nApós o registro, envie outra mensagem para consultar sua posição.`;

          const res = await fetch(
            `https://graph.facebook.com/${version}/${phoneId}/messages`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                messaging_product: "whatsapp",
                to: message.from,
                type: "text",
                text: { body: text },
              }),
            }
          );
          if (!res.ok) throw new Error(`WhatsApp HTTP ${res.status}`);
        }
      }
    }
    return new NextResponse(null, { status: 200 });
  } catch (err) {
    console.error("Webhook error:", err);
    return new NextResponse(null, { status: 500 });
  }
}

function phoneInVariantsSql(column: typeof customers.phone, phone: string) {
  const [a, b] = phoneVariants(phone);
  const normalized = sql<string>`regexp_replace(${column}, '[^0-9]', '', 'g')`;
  return sql<boolean>`${normalized} IN (${a}, ${b})`;
}
