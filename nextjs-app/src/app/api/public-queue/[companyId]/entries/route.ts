export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  eq,
  and,
  inArray,
  sql,
  max as drizzleMax,
  count,
} from "drizzle-orm";
import {
  appointments,
  appointmentServices,
  companies,
  customers,
  services,
} from "@/db/schema";
import { hashTicket } from "@/lib/ticket";
import { phoneVariants } from "@/lib/phone";
import { todaySPString, parseISODate } from "@/lib/date";
import { z } from "zod";

const entrySchema = z.object({
  nome: z.string().min(1).max(100),
  telefone_whatsapp: z.string().min(1).max(20),
  servico_id: z.number().int().positive().optional(),
  servico_ids: z.array(z.number().int().positive()).optional(),
  ticket: z.string().regex(/^[0-9a-f]{64}$/),
});

function phoneInVariants(column: typeof customers.phone, phone: string) {
  const [a, b] = phoneVariants(phone);
  const normalized = sql<string>`regexp_replace(${column}, '[^0-9]', '', 'g')`;
  return sql<boolean>`${normalized} IN (${a}, ${b})`;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId: rawCompanyId } = await params;
  const companyId = Number(rawCompanyId);
  if (!companyId || isNaN(companyId)) {
    return NextResponse.json(
      { erro: "Estabelecimento não encontrado." },
      { status: 404 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ erro: "Invalid JSON" }, { status: 400 });
  }

  const parsed = entrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { erro: "Confira seu nome, WhatsApp e escolha serviços sem repetição." },
      { status: 400 }
    );
  }

  const { nome, telefone_whatsapp, servico_id, servico_ids, ticket } = parsed.data;
  const serviceIds = servico_ids ?? (servico_id ? [servico_id] : []);

  if (
    serviceIds.length === 0 ||
    new Set(serviceIds).size !== serviceIds.length
  ) {
    return NextResponse.json(
      { erro: "Confira seu nome, WhatsApp e escolha serviços sem repetição." },
      { status: 400 }
    );
  }

  const phone = telefone_whatsapp.trim();
  const name = nome.trim();
  const ticketHash = hashTicket(ticket);
  const attendanceDate = parseISODate(todaySPString());

  const result = await db.transaction(async (tx) => {
    const [company] = await tx
      .select()
      .from(companies)
      .where(and(eq(companies.id, companyId), eq(companies.active, true)))
      .for("update");

    if (!company) {
      return { erro: "servico" };
    }

    const existingTicket = await tx
      .select({ position: appointments.position })
      .from(appointments)
      .where(
        and(eq(appointments.ticketHash, ticketHash), eq(appointments.companyId, companyId))
      )
      .limit(1);

    if (existingTicket.length > 0) {
      return { existente: true, posicao: existingTicket[0].position };
    }

    const ownedServices = await tx
      .select({ id: services.id })
      .from(services)
      .where(and(eq(services.companyId, companyId), inArray(services.id, serviceIds)))
      .for("share");

    if (ownedServices.length !== serviceIds.length) {
      return { erro: "servico" };
    }

    let customer = await tx
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.companyId, companyId),
          phoneInVariants(customers.phone, phone)
        )
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (customer) {
      const active = await tx
        .select({ id: appointments.id })
        .from(appointments)
        .where(
          and(
            eq(appointments.companyId, companyId),
            eq(appointments.attendanceDate, attendanceDate),
            inArray(appointments.status, ["agendado", "confirmado"]),
            eq(appointments.customerId, customer.id)
          )
        )
        .limit(1);
      if (active.length > 0) {
        return { erro: "entrada_ativa" };
      }
    } else {
      const [created] = await tx
        .insert(customers)
        .values({ companyId, name, phone })
        .returning();
      customer = created;
    }

    const maxResult = await tx
      .select({ value: drizzleMax(appointments.position) })
      .from(appointments)
      .where(
        and(
          eq(appointments.companyId, companyId),
          eq(appointments.attendanceDate, attendanceDate),
          sql`${appointments.position} IS NOT NULL`
        )
      );

    const position = (maxResult[0]?.value ?? 0) + 1;

    const [appointment] = await tx
      .insert(appointments)
      .values({
        companyId,
        customerId: customer.id,
        legacyServiceId: serviceIds[0],
        position,
        ticketHash,
        attendanceDate,
        status: "agendado",
      })
      .returning();

    await tx.insert(appointmentServices).values(
      serviceIds.map((sid) => ({
        appointmentId: appointment.id,
        serviceId: sid,
        customerPackageId: null as number | null,
      }))
    );

    return { existente: false, posicao: position };
  });

  if (result.erro === "servico") {
    return NextResponse.json(
      { erro: "Estabelecimento ou serviço não encontrado." },
      { status: 404 }
    );
  }
  if (result.erro === "entrada_ativa") {
    return NextResponse.json(
      { erro: "Já existe uma entrada ativa para este telefone." },
      { status: 409 }
    );
  }

  return NextResponse.json(
    { posicao_fila: result.posicao },
    { status: result.existente ? 200 : 201 }
  );
}
