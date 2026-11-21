export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import {
  appointments,
  companies,
  appointmentServices,
  services,
  customerPackages,
  servicePackages,
  customers,
  serviceRecords,
} from "@/db/schema";
import { requireAuth, ResponseError } from "@/lib/auth";
import { z } from "zod";

const statusSchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(["confirmado", "concluido", "cancelado"]),
});

const activeStatuses: Array<"agendado" | "confirmado"> = [
  "agendado",
  "confirmado",
];
const finalStatuses: Array<"concluido" | "cancelado"> = ["concluido", "cancelado"];

export async function PATCH(request: Request) {
  try {
    const auth = await requireAuth(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ erro: "Invalid JSON" }, { status: 400 });
    }

    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { erro: "Informe um ID e um status válidos." },
        { status: 400 }
      );
    }

    const { id, status } = parsed.data;

    const result = await db.transaction(async (tx) => {
      const [company] = await tx
        .select()
        .from(companies)
        .where(and(eq(companies.id, auth.companyId), eq(companies.active, true)))
        .for("update");

      if (!company) {
        return { erro: "registro" };
      }

      const [appointment] = await tx
        .select()
        .from(appointments)
        .where(
          and(eq(appointments.id, id), eq(appointments.companyId, auth.companyId))
        );

      if (!appointment) {
        return { erro: "registro" };
      }

      if (appointment.status === status) {
        return { mudou: false };
      }

      if (finalStatuses.includes(appointment.status as any)) {
        return { erro: "transicao" };
      }

      if (status === "confirmado") {
        const inProgress = await tx
          .select({ id: appointments.id })
          .from(appointments)
          .where(
            and(
              eq(appointments.companyId, auth.companyId),
              eq(appointments.attendanceDate, appointment.attendanceDate),
              eq(appointments.status, "confirmado"),
              sql`${appointments.position} IS NOT NULL`
            )
          )
          .limit(1);

        if (inProgress.length > 0) {
          return { erro: "atendimento" };
        }
      }

      await tx
        .update(appointments)
        .set({ status })
        .where(eq(appointments.id, id));

      if (status === "cancelado" && appointment.status === "agendado") {
        const items = await tx
          .select({ customerPackageId: appointmentServices.customerPackageId })
          .from(appointmentServices)
          .where(eq(appointmentServices.appointmentId, id));

        const packageIds = items
          .map((i) => i.customerPackageId)
          .filter((pid): pid is number => pid !== null);

        for (const packageId of Array.from(new Set(packageIds))) {
          await tx
            .update(customerPackages)
            .set({
              remainingSessions: sql`${customerPackages.remainingSessions} + 1`,
              status: sql`CASE WHEN ${customerPackages.status} = 'concluido' THEN 'ativo'::package_status ELSE ${customerPackages.status} END`,
            })
            .where(eq(customerPackages.id, packageId));
        }
      }

      if (status === "concluido") {
        const items = await tx
          .select({
            serviceId: appointmentServices.serviceId,
            customerPackageId: appointmentServices.customerPackageId,
          })
          .from(appointmentServices)
          .where(eq(appointmentServices.appointmentId, id))
          .orderBy(appointmentServices.serviceId);

        const serviceIds = items.map((i) => i.serviceId);
        const serviceRows = await tx
          .select()
          .from(services)
          .where(inArray(services.id, serviceIds));

        const packageIds = items
          .map((i) => i.customerPackageId)
          .filter((pid): pid is number => pid !== null);
        const packageRows = packageIds.length
          ? await tx
              .select({
                id: customerPackages.id,
                packageId: customerPackages.packageId,
                remainingSessions: customerPackages.remainingSessions,
              })
              .from(customerPackages)
              .where(inArray(customerPackages.id, packageIds))
          : [];

        const packageTemplateIds = packageRows.map((p) => p.packageId);
        const templates = packageTemplateIds.length
          ? await tx
              .select()
              .from(servicePackages)
              .where(inArray(servicePackages.id, packageTemplateIds))
          : [];

        const [customer] = await tx
          .select({ name: customers.name })
          .from(customers)
          .where(eq(customers.id, appointment.customerId));

        const todaySP = new Intl.DateTimeFormat("sv-SE", {
          timeZone: "America/Sao_Paulo",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());
        const completionDate = new Date(todaySP + "T00:00:00");
        const completedAt = new Date();

        let itemNumber = 1;
        for (const item of items) {
          const service = serviceRows.find((s) => s.id === item.serviceId);
          if (!service) continue;

          let value: string;
          let packageName: string | null = null;

          if (item.customerPackageId) {
            const cp = packageRows.find((p) => p.id === item.customerPackageId);
            const tmpl = cp
              ? templates.find((t) => t.id === cp.packageId)
              : undefined;
            if (!tmpl || Number(tmpl.totalSessions) === 0) continue;
            value = (Number(tmpl.totalPrice) / Number(tmpl.totalSessions)).toFixed(
              18
            );
            packageName = tmpl.name;
          } else {
            value = String(service.price);
          }

          await tx.insert(serviceRecords).values({
            appointmentId: id,
            item: itemNumber++,
            companyId: auth.companyId,
            customerName: customer?.name ?? "",
            serviceName: service.name,
            packageName,
            value,
            completionDate,
            completedAt,
          });
        }
      }

      return { mudou: true, data: appointment.attendanceDate };
    });

    if (result.erro === "registro") {
      return NextResponse.json(
        { erro: "Agendamento não encontrado." },
        { status: 404 }
      );
    }
    if (result.erro === "transicao") {
      return NextResponse.json(
        { erro: "Este agendamento já foi encerrado." },
        { status: 409 }
      );
    }
    if (result.erro === "atendimento") {
      return NextResponse.json(
        { erro: "Conclua o atendimento atual antes de chamar o próximo." },
        { status: 409 }
      );
    }

    return NextResponse.json({ mensagem: "Status atualizado com sucesso!" });
  } catch (err) {
    if (err instanceof ResponseError) {
      return NextResponse.json({ erro: err.message }, { status: err.status });
    }
    console.error("Update status error:", err);
    return NextResponse.json(
      { erro: "Erro interno ao atualizar status." },
      { status: 500 }
    );
  }
}
