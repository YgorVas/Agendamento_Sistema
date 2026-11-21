export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { appointments, companies } from "@/db/schema";
import { hashTicket } from "@/lib/ticket";
import { getBearerToken } from "@/lib/auth";

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
