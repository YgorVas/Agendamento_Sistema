import { and, eq, sql } from "drizzle-orm";
import type { db } from "@/db";
import { customerPackages, servicePackages } from "@/db/schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type PackageSelection = { servico_id: number; cliente_pacote_id: number };

export async function lockUsablePackage(
  tx: Transaction,
  companyId: number,
  customerId: number,
  effectiveDate: Date,
  selection: PackageSelection
) {
  const [pkg] = await tx
    .select({ id: customerPackages.id })
    .from(customerPackages)
    .innerJoin(servicePackages, eq(customerPackages.packageId, servicePackages.id))
    .where(and(
      eq(customerPackages.id, selection.cliente_pacote_id),
      eq(customerPackages.customerId, customerId),
      eq(servicePackages.companyId, companyId),
      eq(servicePackages.serviceId, selection.servico_id),
      eq(customerPackages.status, "ativo"),
      sql`${customerPackages.remainingSessions} > 0`,
      sql`${customerPackages.validUntil} >= ${sql.param(effectiveDate, customerPackages.validUntil)}`
    ))
    .for("update")
    .limit(1);
  return pkg;
}

export async function debitPackageSession(tx: Transaction, packageId: number) {
  await tx
    .update(customerPackages)
    .set({
      remainingSessions: sql`${customerPackages.remainingSessions} - 1`,
      status: sql`CASE WHEN ${customerPackages.remainingSessions} = 1 THEN 'concluido'::package_status ELSE 'ativo'::package_status END`,
    })
    .where(eq(customerPackages.id, packageId));
}
