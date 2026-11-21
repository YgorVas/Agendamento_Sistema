export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  eq,
  and,
  or,
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
  customerPackages,
  servicePackages,
} from "@/db/schema";
import { requireAuth, ResponseError } from "@/lib/auth";
import { generateTicket, hashTicket } from "@/lib/ticket";
import { phoneVariants } from "@/lib/phone";
import { isValidISODate, parseISODate } from "@/lib/date";
import { z } from "zod";

const itemSchema = z.object({
  servico_id: z.number().int().positive(),
  cliente_pacote_id: z.number().int().positive().optional().nullable(),
});

const entrySchema = z.object({
  cliente_id: z.number().int().positive(),
  data_atendimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  servico_id: z.number().int().positive().optional(),
  cliente_pacote_id: z.number().int().positive().optional().nullable(),
  servicos: z.array(itemSchema).optional(),
});

function normalizedPhoneInVariants(column: typeof customers.phone, phone: string) {
  const [a, b] = phoneVariants(phone);
  const normalized = sql<string>`regexp_replace(${column}, '[^0-9]', '', 'g')`;
  return sql<boolean>`${normalized} IN (${a}, ${b})`;
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

    const parsed = entrySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { erro: "Informe IDs válidos, serviços sem repetição e uma data no formato YYYY-MM-DD." },
        { status: 400 }
      );
    }

    let { cliente_id, data_atendimento, servico_id, cliente_pacote_id, servicos } =
      parsed.data;

    if (!isValidISODate(data_atendimento)) {
      return NextResponse.json(
        { erro: "Informe uma data válida no formato YYYY-MM-DD." },
        { status: 400 }
      );
    }
    const attendanceDate = parseISODate(data_atendimento);

    if (!servicos) {
      servicos = [{ servico_id: servico_id!, cliente_pacote_id }];
    }

    if (
      servicos.length === 0 ||
      new Set(servicos.map((s) => s.servico_id)).size !== servicos.length
    ) {
      return NextResponse.json(
        { erro: "Informe IDs válidos, serviços sem repetição e uma data no formato YYYY-MM-DD." },
        { status: 400 }
      );
    }

    const serviceIds = servicos.map((s) => s.servico_id);

    const result = await db.transaction(async (tx) => {
      const [company] = await tx
        .select()
        .from(companies)
        .where(and(eq(companies.id, auth.companyId), eq(companies.active, true)))
        .for("update");

      if (!company) {
        return { erro: "empresa" };
      }

      const [customer] = await tx
        .select()
        .from(customers)
        .where(
          and(eq(customers.id, cliente_id), eq(customers.companyId, auth.companyId))
        )
        .for("share");

      if (!customer) {
        return { erro: "cadastro" };
      }

      const activeEntries = await tx
        .select({ id: appointments.id })
        .from(appointments)
        .innerJoin(customers, eq(appointments.customerId, customers.id))
        .where(
          and(
            eq(appointments.companyId, auth.companyId),
            eq(appointments.attendanceDate, attendanceDate),
            inArray(appointments.status, ["agendado", "confirmado"]),
            or(
              eq(customers.id, cliente_id),
              normalizedPhoneInVariants(customers.phone, customer.phone)
            )
          )
        )
        .limit(1);

      if (activeEntries.length > 0) {
        return { erro: "entrada_ativa" };
      }

      const ownedServices = await tx
        .select({ id: services.id })
        .from(services)
        .where(
          and(
            eq(services.companyId, auth.companyId),
            inArray(services.id, serviceIds)
          )
        )
        .for("share");

      if (ownedServices.length !== serviceIds.length) {
        return { erro: "cadastro" };
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const effectiveDate = attendanceDate < today ? today : attendanceDate;

      for (const item of servicos!) {
        if (!item.cliente_pacote_id) continue;

        const [pkg] = await tx
          .select({ id: customerPackages.id })
          .from(customerPackages)
          .innerJoin(
            servicePackages,
            eq(customerPackages.packageId, servicePackages.id)
          )
          .where(
            and(
              eq(customerPackages.id, item.cliente_pacote_id),
              eq(customerPackages.customerId, cliente_id),
              eq(servicePackages.companyId, auth.companyId),
              eq(customerPackages.status, "ativo"),
              sql`${customerPackages.remainingSessions} > 0`,
              sql`${customerPackages.validUntil} >= ${sql.param(effectiveDate, customerPackages.validUntil)}`,
              eq(servicePackages.serviceId, item.servico_id)
            )
          )
          .for("update")
          .limit(1);

        if (!pkg) {
          return { erro: "pacote" };
        }
      }

      for (const item of servicos!) {
        if (!item.cliente_pacote_id) continue;
        await tx
          .update(customerPackages)
          .set({
            remainingSessions: sql`${customerPackages.remainingSessions} - 1`,
            status: sql`CASE WHEN ${customerPackages.remainingSessions} = 1 THEN 'concluido'::package_status ELSE 'ativo'::package_status END`,
          })
          .where(eq(customerPackages.id, item.cliente_pacote_id));
      }

      const maxResult = await tx
        .select({ value: drizzleMax(appointments.position) })
        .from(appointments)
        .where(
          and(
            eq(appointments.companyId, auth.companyId),
            eq(appointments.attendanceDate, attendanceDate),
            sql`${appointments.position} IS NOT NULL`
          )
        );

      const position = (maxResult[0]?.value ?? 0) + 1;

      const activeCount = await tx
        .select({ value: count() })
        .from(appointments)
        .where(
          and(
            eq(appointments.companyId, auth.companyId),
            eq(appointments.attendanceDate, attendanceDate),
            inArray(appointments.status, ["agendado", "confirmado"])
          )
        );

      const pessoas = activeCount[0]?.value ?? 0;
      const ticket = generateTicket();
      const first = servicos![0];

      const [appointment] = await tx
        .insert(appointments)
        .values({
          companyId: auth.companyId,
          customerId: cliente_id,
          legacyServiceId: first.servico_id,
          legacyPackageId: first.cliente_pacote_id ?? null,
          position,
          ticketHash: hashTicket(ticket),
          attendanceDate,
          status: "agendado",
        })
        .returning();

      await tx.insert(appointmentServices).values(
        servicos!.map((item) => ({
          appointmentId: appointment.id,
          serviceId: item.servico_id,
          customerPackageId: item.cliente_pacote_id ?? null,
        }))
      );

      return {
        id: appointment.id,
        ticket,
        position,
        pessoas,
      };
    });

    if (result.erro === "empresa") {
      return NextResponse.json(
        { erro: "Empresa, cliente ou serviço não encontrado." },
        { status: 404 }
      );
    }
    if (result.erro === "cadastro") {
      return NextResponse.json(
        { erro: "Empresa, cliente ou serviço não encontrado." },
        { status: 404 }
      );
    }
    if (result.erro === "entrada_ativa") {
      return NextResponse.json(
        { erro: "Este cliente já tem uma entrada ativa na fila." },
        { status: 409 }
      );
    }
    if (result.erro === "pacote") {
      return NextResponse.json(
        { erro: "Pacote incompatível com o serviço, expirado ou sem sessões disponíveis." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        mensagem: "Cliente inserido na fila com sucesso!",
        agendamento_id: result.id,
        ticket: result.ticket,
        posicao_fila: result.position,
        pessoas_na_frente: result.pessoas,
        aviso_cliente:
          result.pessoas === 0
            ? "Você é o primeiro da fila! Aguarde o início do atendimento."
            : `Agendamento confirmado! Há ${result.pessoas} pessoa(s) na sua frente.`,
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof ResponseError) {
      return NextResponse.json({ erro: err.message }, { status: err.status });
    }
    console.error("Create appointment error:", err);
    return NextResponse.json(
      { erro: "Erro interno ao entrar na fila." },
      { status: 500 }
    );
  }
}
