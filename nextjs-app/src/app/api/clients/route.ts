export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { eq, and, sql } from "drizzle-orm";
import { customers, companies } from "@/db/schema";
import { requireAuth, ResponseError } from "@/lib/auth";
import { phoneVariants } from "@/lib/phone";
import { z } from "zod";
import { clientRegistrationSchema, clientRegistrationError, fullNameFits } from "@/lib/client-registration";

const clientSchema = clientRegistrationSchema.extend({
  email: z.string().max(100).optional(),
  observacoes: z.string().optional(),
});

function phoneInVariantsSql(column: typeof customers.phone, phone: string) {
  const [a, b] = phoneVariants(phone);
  const normalized = sql<string>`regexp_replace(${column}, '[^0-9]', '', 'g')`;
  return sql<boolean>`${normalized} IN (${a}, ${b})`;
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    const list = await db
      .select()
      .from(customers)
      .where(eq(customers.companyId, auth.companyId))
      .orderBy(customers.name);
    return NextResponse.json(list);
  } catch (err) {
    if (err instanceof ResponseError) {
      return NextResponse.json({ erro: err.message }, { status: err.status });
    }
    console.error("List clients error:", err);
    return NextResponse.json({ erro: "Erro interno." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ erro: "Invalid JSON" }, { status: 400 });
    }

    const parsed = clientSchema.safeParse(body);
    if (!parsed.success || !fullNameFits(parsed.data)) {
      return NextResponse.json(
        { erro: clientRegistrationError },
        { status: 400 }
      );
    }

    const { nome, sobrenome, telefone_whatsapp: phone, email, observacoes } = parsed.data;

    const result = await db.transaction(async (tx) => {
      await tx
        .select()
        .from(companies)
        .where(eq(companies.id, auth.companyId))
        .for("update");

      const existing = await tx
        .select()
        .from(customers)
        .where(
          and(
            eq(customers.companyId, auth.companyId),
            phoneInVariantsSql(customers.phone, phone)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        return { cliente: existing[0], existente: true };
      }

      const [created] = await tx
        .insert(customers)
        .values({
          companyId: auth.companyId,
          name: `${nome} ${sobrenome}`,
          phone,
          email: email || null,
          notes: observacoes || null,
        })
        .returning();

      return { cliente: created, existente: false };
    });

    return NextResponse.json(
      {
        mensagem: result.existente
          ? "Cliente já cadastrado."
          : "Cliente cadastrado com sucesso!",
        cliente_id: result.cliente.id,
        existente: result.existente,
        cliente: result.cliente,
      },
      { status: result.existente ? 200 : 201 }
    );
  } catch (err) {
    if (err instanceof ResponseError) {
      return NextResponse.json({ erro: err.message }, { status: err.status });
    }
    console.error("Create client error:", err);
    return NextResponse.json(
      { erro: "Erro interno ao cadastrar cliente." },
      { status: 500 }
    );
  }
}
