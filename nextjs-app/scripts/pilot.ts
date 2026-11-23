import "dotenv/config";
import { and, asc, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { client, db } from "../src/db";
import { companies, companyInvites, customerDataRequests, passwordResets, rateLimits, userCompanies, users } from "../src/db/schema";
import { createPilotToken } from "../src/lib/pilot-tokens";

async function run([action, value, detail]: string[]) {
  if (action === "convidar") {
    const email = z.string().trim().email().max(100).toLowerCase().parse(value);
    const kind = z.enum(["cadastro", "nova-loja"]).parse(detail ?? "cadastro");
    const { code, tokenHash } = createPilotToken();
    await db.insert(companyInvites).values({
      email, kind, tokenHash, expiresAt: sql`now() + interval '72 hours'`,
    });
    console.log(`Convite para ${email} (${kind}, válido por 72 horas)\n${code}`);
    return;
  }

  if (action === "recuperar") {
    const email = z.string().trim().email().max(254).toLowerCase().parse(value);
    const [account] = await db.select({ userId: users.id }).from(users)
      .innerJoin(userCompanies, eq(userCompanies.userId, users.id))
      .innerJoin(companies, eq(companies.id, userCompanies.companyId))
      .where(and(eq(users.email, email), eq(companies.active, true)))
      .limit(1);
    if (!account) throw new Error("Conta sem acesso a uma loja ativa.");
    const { code, tokenHash } = createPilotToken();
    const expiresAt = sql`now() + interval '30 minutes'`;
    await db.insert(passwordResets).values({ userId: account.userId, tokenHash, expiresAt })
      .onConflictDoUpdate({ target: passwordResets.userId, set: { tokenHash, expiresAt } });
    console.log(`Código para ${email} (válido por 30 minutos)\n${code}`);
    return;
  }

  if (action === "solicitacoes") {
    const pending = await db.select().from(customerDataRequests)
      .where(eq(customerDataRequests.status, "pendente"))
      .orderBy(asc(customerDataRequests.id));
    console.table(pending);
    return;
  }

  if (action === "resolver") {
    const id = z.coerce.number().int().positive().max(2147483647).parse(value);
    const status = z.enum(["atendida", "recusada"]).parse(detail);
    const [record] = await db.update(customerDataRequests).set({ status, resolvedAt: sql`now()` })
      .where(and(eq(customerDataRequests.id, id), eq(customerDataRequests.status, "pendente")))
      .returning({ id: customerDataRequests.id });
    if (!record) throw new Error("Solicitação pendente não encontrada.");
    console.log(`Solicitação nº ${record.id} ${status}.`);
    return;
  }

  if (action === "limpar-expirados") {
    await db.transaction(async (tx) => {
      await tx.delete(rateLimits).where(lt(rateLimits.expiresAt, sql`now()`));
      await tx.delete(companyInvites).where(lt(companyInvites.expiresAt, sql`now()`));
      await tx.delete(passwordResets).where(lt(passwordResets.expiresAt, sql`now()`));
    });
    console.log("Limites e códigos expirados removidos.");
    return;
  }

  throw new Error("Comandos: convidar <e-mail> [cadastro|nova-loja], recuperar <e-mail>, solicitacoes, resolver <número> <atendida|recusada>, limpar-expirados.");
}

run(process.argv.slice(2))
  .catch((error: unknown) => {
    console.error(error instanceof Error && error.name !== "DrizzleQueryError" ? error.message : "Falha ao acessar o banco do piloto.");
    process.exitCode = 1;
  })
  .finally(() => client.end());
