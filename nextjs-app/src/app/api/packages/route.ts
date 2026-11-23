export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { eq, and } from "drizzle-orm";
import { servicePackages, services, customerPackages } from "@/db/schema";
import { requireAuth, requireManagement, ResponseError } from "@/lib/auth";
import { z } from "zod";

const packageSchema = z.object({
  nome: z.string().min(1).max(100),
  descricao: z.string().max(2000).optional(),
  servico_id: z.number().int().positive(),
  total_sessoes: z.number().int().positive(),
  preco_total: z.number().positive(),
  dias_validade: z.number().int().positive().default(30),
});

const positiveInteger = z.number().int().positive().max(2147483647);
const updatePackageSchema = packageSchema.extend({
  id: positiveInteger,
  nome: z.string().trim().min(1).max(100),
  servico_id: positiveInteger,
  total_sessoes: positiveInteger,
  preco_total: z.number().min(0.01).max(99999999.99).multipleOf(0.01),
  dias_validade: positiveInteger,
});

function packageValues(data: z.infer<typeof packageSchema>) {
  return {
    serviceId: data.servico_id,
    name: data.nome.trim(),
    description: data.descricao?.trim() || null,
    totalSessions: data.total_sessoes,
    totalPrice: String(data.preco_total),
    validityDays: data.dias_validade,
  };
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    const list = await db
      .select({
        id: servicePackages.id,
        companyId: servicePackages.companyId,
        serviceId: servicePackages.serviceId,
        name: servicePackages.name,
        description: servicePackages.description,
        totalSessions: servicePackages.totalSessions,
        totalPrice: servicePackages.totalPrice,
        validityDays: servicePackages.validityDays,
      })
      .from(servicePackages)
      .where(and(eq(servicePackages.companyId, auth.companyId), eq(servicePackages.available, true)));
    return NextResponse.json(list);
  } catch (err) {
    if (err instanceof ResponseError) {
      return NextResponse.json({ erro: err.message }, { status: err.status });
    }
    console.error("List packages error:", err);
    return NextResponse.json({ erro: "Erro interno." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireManagement(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ erro: "Invalid JSON" }, { status: 400 });
    }

    const parsed = packageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { erro: "Informe o nome, o serviço, o total de sessões e o preço." },
        { status: 400 }
      );
    }

    const values = packageValues(parsed.data);

    const service = await db.query.services.findFirst({
      where: and(
        eq(services.id, values.serviceId),
        eq(services.companyId, auth.companyId)
      ),
    });

    if (!service) {
      return NextResponse.json(
        { erro: "Serviço não encontrado." },
        { status: 404 }
      );
    }

    const [pkg] = await db
      .insert(servicePackages)
      .values({
        companyId: auth.companyId,
        ...values,
      })
      .returning();

    return NextResponse.json(
      { mensagem: "Modelo de pacote cadastrado com sucesso!", pacote_id: pkg.id },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof ResponseError) {
      return NextResponse.json({ erro: err.message }, { status: err.status });
    }
    console.error("Create package error:", err);
    return NextResponse.json(
      { erro: "Erro interno ao cadastrar pacote." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireManagement(request);
    const parsed = updatePackageSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { erro: "Informe um nome, serviço, número de sessões, preço e validade válidos para o pacote." },
        { status: 400 }
      );
    }

    const { id } = parsed.data;
    const values = packageValues(parsed.data);
    const pkg = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ id: servicePackages.id })
        .from(servicePackages)
        .where(and(
          eq(servicePackages.id, id),
          eq(servicePackages.companyId, auth.companyId),
          eq(servicePackages.available, true)
        ))
        .for("update");
      if (!current) {
        throw new ResponseError("Modelo de pacote indisponível. Atualize a página e tente novamente.", 404);
      }

      const service = await tx.query.services.findFirst({
        where: and(eq(services.id, values.serviceId), eq(services.companyId, auth.companyId)),
      });
      if (!service) {
        throw new ResponseError("Serviço não encontrado.", 404);
      }

      const assignment = await tx.query.customerPackages.findFirst({
        columns: { id: true },
        where: eq(customerPackages.packageId, id),
      });
      if (assignment) {
        // Existing assignments keep pointing to the original service and prices.
        await tx.update(servicePackages).set({ available: false }).where(eq(servicePackages.id, id));
        const [updated] = await tx
          .insert(servicePackages)
          .values({ companyId: auth.companyId, ...values })
          .returning();
        return updated;
      }

      const [updated] = await tx
        .update(servicePackages)
        .set(values)
        .where(eq(servicePackages.id, id))
        .returning();
      return updated;
    });

    return NextResponse.json(pkg);
  } catch (err) {
    if (err instanceof ResponseError) {
      return NextResponse.json({ erro: err.message }, { status: err.status });
    }
    console.error("Update package error:", err);
    return NextResponse.json({ erro: "Erro interno ao editar pacote." }, { status: 500 });
  }
}
