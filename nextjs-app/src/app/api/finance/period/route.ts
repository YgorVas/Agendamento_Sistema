export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { eq, and, between, sql } from "drizzle-orm";
import { serviceRecords } from "@/db/schema";
import { requireAuth, ResponseError } from "@/lib/auth";
import {
  todaySPString,
  parseISODate,
  startOfWeekFor,
  endOfWeekFor,
  startOfMonthFor,
  endOfMonthFor,
  startOfYearFor,
  endOfYearFor,
  isValidISODate,
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

    const { searchParams } = new URL(request.url);
    const tipo = searchParams.get("tipo") ?? "mes";
    const dataParam = searchParams.get("data");
    const hojeStr = todaySPString();

    if (!["dia", "semana", "mes", "ano"].includes(tipo)) {
      return NextResponse.json(
        { erro: "Escolha dia, semana, mês ou ano e informe uma data válida até hoje." },
        { status: 400 }
      );
    }

    const referencia = dataParam || hojeStr;
    if (!isValidISODate(referencia) || referencia > hojeStr) {
      return NextResponse.json(
        { erro: "Escolha dia, semana, mês ou ano e informe uma data válida até hoje." },
        { status: 400 }
      );
    }

    let inicio: Date | undefined;
    let fim: Date | undefined;
    switch (tipo) {
      case "dia":
        inicio = parseISODate(referencia);
        fim = parseISODate(referencia);
        break;
      case "semana":
        inicio = parseISODate(startOfWeekFor(referencia));
        fim = parseISODate(endOfWeekFor(referencia));
        break;
      case "mes":
        inicio = parseISODate(startOfMonthFor(referencia));
        fim = parseISODate(endOfMonthFor(referencia));
        break;
      case "ano":
        inicio = parseISODate(startOfYearFor(referencia));
        fim = parseISODate(endOfYearFor(referencia));
        break;
    }

    if (!inicio || !fim) {
      return NextResponse.json(
        { erro: "Escolha dia, semana, mês ou ano e informe uma data válida até hoje." },
        { status: 400 }
      );
    }

    const hoje = parseISODate(hojeStr);
    if (fim > hoje) fim = hoje;

    const serviceTotals = await db
      .select({
        serviceName: serviceRecords.serviceName,
        value: sql<string>`SUM(${serviceRecords.value})`,
      })
      .from(serviceRecords)
      .where(
        and(
          eq(serviceRecords.companyId, auth.companyId),
          between(serviceRecords.completionDate, inicio, fim)
        )
      )
      .groupBy(serviceRecords.serviceName);

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
          between(serviceRecords.completionDate, inicio, fim)
        )
      )
      .orderBy(
        sql`${serviceRecords.completionDate} DESC`,
        sql`${serviceRecords.completedAt} DESC`,
        sql`${serviceRecords.appointmentId} DESC`,
        serviceRecords.item
      )
      .limit(30);

    const total = serviceTotals.reduce(
      (sum, s) => sum + Number(s.value),
      0
    );

    return NextResponse.json(
      {
        periodo: {
          tipo,
          referencia,
          inicio: inicio.toISOString().slice(0, 10),
          fim: fim.toISOString().slice(0, 10),
          hoje: hojeStr,
        },
        total: total.toFixed(2),
        servicos: serviceTotals.map((s) => ({
          nome: s.serviceName,
          valor: Number(s.value).toFixed(2),
        })),
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
    console.error("Finance period error:", err);
    return NextResponse.json(
      { erro: "Não foi possível carregar o período financeiro." },
      { status: 500 }
    );
  }
}
