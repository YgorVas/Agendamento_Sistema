export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { eq, and, sql } from "drizzle-orm";
import {
  appointments,
  customers,
  services,
  appointmentServices,
} from "@/db/schema";
import { requireAuth, ResponseError } from "@/lib/auth";
import { isValidISODate, parseISODate } from "@/lib/date";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ date: string }> }
) {
  try {
    const auth = await requireAuth(request);
    const dateParam = (await params).date;

    if (!isValidISODate(dateParam)) {
      return NextResponse.json(
        { erro: "Informe uma data válida no formato YYYY-MM-DD." },
        { status: 400 }
      );
    }
    const attendanceDate = parseISODate(dateParam);

    const rows = await db
      .select({
        appointmentId: appointments.id,
        position: appointments.position,
        status: appointments.status,
        customerName: customers.name,
        customerPhone: customers.phone,
        serviceId: services.id,
        serviceName: services.name,
        durationMinutes: services.durationMinutes,
        customerPackageId: appointmentServices.customerPackageId,
      })
      .from(appointments)
      .innerJoin(customers, eq(appointments.customerId, customers.id))
      .leftJoin(
        appointmentServices,
        eq(appointments.id, appointmentServices.appointmentId)
      )
      .leftJoin(services, eq(appointmentServices.serviceId, services.id))
      .where(
        and(
          eq(appointments.companyId, auth.companyId),
          eq(appointments.attendanceDate, attendanceDate),
          eq(appointments.status, "agendado"),
          sql`${appointments.position} IS NOT NULL`
        )
      )
      .orderBy(appointments.position, appointments.id, services.id)
      .limit(10);

    if (rows.length === 0) {
      return NextResponse.json(
        { mensagem: "Não há clientes na fila para esta data." },
        { status: 404 }
      );
    }

    const entry = {
      id: rows[0].appointmentId,
      posicao_fila: rows[0].position,
      status: rows[0].status,
      cliente_nome: rows[0].customerName,
      cliente_telefone: rows[0].customerPhone,
      duracao_minutos: 0,
      servicos: [] as {
        servico_id: number;
        servico_nome: string;
        duracao_minutos: number;
        cliente_pacote_id: number | null;
      }[],
    };

    for (const row of rows) {
      if (row.appointmentId !== entry.id) break;
      if (row.serviceId) {
        entry.servicos.push({
          servico_id: row.serviceId,
          servico_nome: row.serviceName!,
          duracao_minutos: row.durationMinutes!,
          cliente_pacote_id: row.customerPackageId,
        });
        entry.duracao_minutos += row.durationMinutes ?? 0;
      }
    }

    return NextResponse.json(entry);
  } catch (err) {
    if (err instanceof ResponseError) {
      return NextResponse.json({ erro: err.message }, { status: err.status });
    }
    console.error("Next queue error:", err);
    return NextResponse.json(
      { erro: "Erro interno ao consultar o próximo da fila." },
      { status: 500 }
    );
  }
}
