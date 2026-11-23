import { eq, sql } from "drizzle-orm";
import type { db } from "@/db";
import { appointments, appointmentServices, customerPackages } from "@/db/schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Callers hold the company's lock and verify the appointment's status.
export async function cancelAppointment(
  tx: Transaction,
  appointment: Pick<typeof appointments.$inferSelect, "id" | "status">
) {
  await tx.update(appointments).set({ status: "cancelado" })
    .where(eq(appointments.id, appointment.id));

  if (appointment.status !== "agendado") return;

  const items = await tx
    .selectDistinct({ packageId: appointmentServices.customerPackageId })
    .from(appointmentServices)
    .where(eq(appointmentServices.appointmentId, appointment.id));

  for (const { packageId } of items) {
    if (packageId === null) continue;
    await tx.update(customerPackages)
      .set({
        remainingSessions: sql`${customerPackages.remainingSessions} + 1`,
        status: sql`CASE WHEN ${customerPackages.status} = 'concluido' THEN 'ativo'::package_status ELSE ${customerPackages.status} END`,
      })
      .where(eq(customerPackages.id, packageId));
  }
}
