export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { appointments, companies } from "@/db/schema";
import { hashTicket } from "@/lib/ticket";
import { getBearerToken } from "@/lib/auth";
import { cancelAppointment } from "@/lib/cancel-appointment";

export async function PATCH(request: Request) {
  const token = getBearerToken(request);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) {
    return NextResponse.json({ erro: "Ticket não encontrado." }, { status: 404 });
  }

  const ticketMatch = eq(appointments.ticketHash, hashTicket(token));
  try {
    const result = await db.transaction(async (tx) => {
      const [company] = await tx
        .select({ id: companies.id })
        .from(appointments)
        .innerJoin(companies, eq(appointments.companyId, companies.id))
        .where(and(ticketMatch, eq(companies.active, true)))
        .for("update", { of: companies });

      if (!company) return "missing";

      const [appointment] = await tx
        .select({ id: appointments.id, status: appointments.status })
        .from(appointments)
        .where(and(ticketMatch, eq(appointments.companyId, company.id)));

      if (!appointment) return "missing";
      if (appointment.status === "cancelado") return "cancelled";
      if (appointment.status !== "agendado") return "unavailable";

      await cancelAppointment(tx, appointment);
      return "cancelled";
    });
    if (result === "missing") {
      return NextResponse.json({ erro: "Ticket não encontrado." }, { status: 404 });
    }
    if (result === "unavailable") {
      return NextResponse.json(
        { erro: "Só é possível cancelar enquanto aguarda na fila." },
        { status: 409 }
      );
    }
    return NextResponse.json({ status: "cancelado" });
  } catch (error) {
    console.error("Ticket cancellation error:", error);
    return NextResponse.json({ erro: "Não foi possível cancelar a entrada." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const token = getBearerToken(request);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) {
    return NextResponse.json({ erro: "Ticket não encontrado." }, { status: 404 });
  }

  const hash = hashTicket(token);

  const [row] = await db
    .select({
      position: appointments.position,
      status: appointments.status,
      companyId: appointments.companyId,
      attendanceDate: appointments.attendanceDate,
    })
    .from(appointments)
    .innerJoin(companies, eq(appointments.companyId, companies.id))
    .where(and(eq(appointments.ticketHash, hash), eq(companies.active, true)))
    .limit(1);

  if (!row) {
    return NextResponse.json({ erro: "Ticket não encontrado." }, { status: 404 });
  }

  const peopleAhead = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(appointments)
    .where(
      and(
        eq(appointments.companyId, row.companyId),
        eq(appointments.attendanceDate, row.attendanceDate),
        sql`${appointments.position} < ${row.position}`,
        inArray(appointments.status, ["agendado", "confirmado"])
      )
    );

  return NextResponse.json(
    {
      posicao_fila: row.position,
      status: row.status,
      pessoas_na_frente: peopleAhead[0]?.count ?? 0,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
