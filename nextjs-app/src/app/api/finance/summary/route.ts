export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { eq, and, between, sql } from "drizzle-orm";
import { serviceRecords } from "@/db/schema";
import { requireAuth, ResponseError } from "@/lib/auth";
import {
  todaySPString,
  startOfWeekSP,
  startOfMonthSP,
  parseISODate,
} from "@/lib/date";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    if (auth.role !== "ADMIN" && auth.role !== "GERENTE") {
      throw new ResponseError(
        "Esta operação exige um cargo de gestão.",
        403
      );
    }

    const hojeStr = todaySPString();
    const inicioSemanaStr = startOfWeekSP(hojeStr);
    const inicioMesStr = startOfMonthSP(hojeStr);
    const hoje = parseISODate(hojeStr);
    const inicioSemana = parseISODate(inicioSemanaStr);
    const inicioMes = parseISODate(inicioMesStr);
    const inicioResumo = inicioSemana < inicioMes ? inicioSemana : inicioMes;

    // Raw SQL fragments bypass Drizzle's column mapping, so date values must be
    // passed as strings; a JS Date would be forwarded to postgres.js as-is and
    // fail during parameter binding.
    const totals = await db
      .select({
        hoje: sql<string>`COALESCE(SUM(CASE WHEN ${serviceRecords.completionDate} = ${hojeStr} THEN ${serviceRecords.value} ELSE 0 END), 0)`,
        semana: sql<string>`COALESCE(SUM(CASE WHEN ${serviceRecords.completionDate} >= ${inicioSemanaStr} THEN ${serviceRecords.value} ELSE 0 END), 0)`,
        mes: sql<string>`COALESCE(SUM(CASE WHEN ${serviceRecords.completionDate} >= ${inicioMesStr} THEN ${serviceRecords.value} ELSE 0 END), 0)`,
        qtdHoje: sql<number>`COUNT(CASE WHEN ${serviceRecords.completionDate} = ${hojeStr} THEN 1 END)::int`,
        qtdSemana: sql<number>`COUNT(CASE WHEN ${serviceRecords.completionDate} >= ${inicioSemanaStr} THEN 1 END)::int`,
        qtdMes: sql<number>`COUNT(CASE WHEN ${serviceRecords.completionDate} >= ${inicioMesStr} THEN 1 END)::int`,
      })
      .from(serviceRecords)
      .where(
        and(
          eq(serviceRecords.companyId, auth.companyId),
          between(serviceRecords.completionDate, inicioResumo, hoje)
        )
      );

    const recent = await db
      .select({
        completionDate: serviceRecords.completionDate,
        customerName: serviceRecords.customerName,
        serviceName: serviceRecords.serviceName,
        packageName: serviceRecords.packageName,
        value: serviceRecords.value,
      })
      .from(serviceRecords)
      .where(
        and(
          eq(serviceRecords.companyId, auth.companyId),
          sql`${serviceRecords.completionDate} <= ${hojeStr}`
        )
      )
      .orderBy(
        sql`${serviceRecords.completionDate} DESC`,
        sql`${serviceRecords.completedAt} DESC`,
        sql`${serviceRecords.appointmentId} DESC`,
        serviceRecords.item
      )
      .limit(30);

    const first = totals[0];

    return NextResponse.json(
      {
        hoje: hojeStr,
        inicio_semana: inicioSemanaStr,
        inicio_mes: inicioMesStr,
        totais: {
          hoje: Number(first?.hoje ?? 0).toFixed(2),
          semana: Number(first?.semana ?? 0).toFixed(2),
          mes: Number(first?.mes ?? 0).toFixed(2),
          qtd_hoje: first?.qtdHoje ?? 0,
          qtd_semana: first?.qtdSemana ?? 0,
          qtd_mes: first?.qtdMes ?? 0,
        },
        registros: recent.map((r) => ({
          data_conclusao: r.completionDate.toISOString().slice(0, 10),
          cliente_nome: r.customerName,
          servico_nome: r.serviceName,
          pacote_nome: r.packageName,
          valor: Number(r.value).toFixed(2),
        })),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    if (err instanceof ResponseError) {
      return NextResponse.json({ erro: err.message }, { status: err.status });
    }
    console.error("Finance summary error:", err);
    return NextResponse.json(
      { erro: "Não foi possível carregar o resumo financeiro." },
      { status: 500 }
    );
  }
}
