export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { eq, and, ne, sql } from "drizzle-orm";
import { appointments, customers, services, appointmentServices } from "@/db/schema";
import { requireAuth, ResponseError } from "@/lib/auth";
import { isValidISODate, parseISODate } from "@/lib/date";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ date: string }> }
) {
  try {
    const auth = await requireAuth(request);
    const { date: dateParam } = await params;

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
          ne(appointments.status, "cancelado"),
          sql`${appointments.position} IS NOT NULL`
        )
      )
      .orderBy(appointments.position, appointments.id, services.id);

    const map = new Map<
      number,
      {
        id: number;
        posicao_fila: number;
        status: string;
        cliente_nome: string;
        cliente_telefone: string;
        duracao_minutos: number;
        servicos: {
          servico_id: number;
          servico_nome: string;
          duracao_minutos: number;
          cliente_pacote_id: number | null;
        }[];
      }
    >();

    for (const row of rows) {
      if (!map.has(row.appointmentId)) {
        map.set(row.appointmentId, {
          id: row.appointmentId,
          posicao_fila: row.position!,
          status: row.status,
          cliente_nome: row.customerName,
          cliente_telefone: row.customerPhone,
          duracao_minutos: 0,
          servicos: [],
        });
      }
      const entry = map.get(row.appointmentId)!;
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

    return NextResponse.json(Array.from(map.values()), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    if (err instanceof ResponseError) {
      return NextResponse.json({ erro: err.message }, { status: err.status });
    }
    console.error("List queue error:", err);
    return NextResponse.json(
      { erro: "Erro interno ao consultar a fila." },
      { status: 500 }
    );
  }
}
