import "dotenv/config";
import { db } from "@/db";
import {
  users,
  companies,
  userCompanies,
  customers,
  services,
  servicePackages,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { and, eq } from "drizzle-orm";
import { randomBytes } from "crypto";

async function upsertUser(email: string, name: string, password: string) {
  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existing) return existing;

  const hash = await hashPassword(password);
  const [row] = await db
    .insert(users)
    .values({ email, name, passwordHash: hash })
    .returning();
  if (!row) throw new Error(`Failed to create user ${email}`);
  return row;
}

async function upsertCompany(
  email: string,
  name: string,
  phone: string,
  password: string
) {
  const existing = await db.query.companies.findFirst({
    where: eq(companies.email, email),
  });
  if (existing) return existing;

  const hash = await hashPassword(password);
  const [row] = await db
    .insert(companies)
    .values({ email, name, phone, passwordHash: hash })
    .returning();
  if (!row) throw new Error(`Failed to create company ${email}`);
  return row;
}

async function upsertCustomer(companyId: number, name: string, phone: string) {
  const existing = await db.query.customers.findFirst({
    where: and(eq(customers.companyId, companyId), eq(customers.phone, phone)),
  });
  if (existing) return existing;

  const [row] = await db
    .insert(customers)
    .values({ companyId, name, phone })
    .returning();
  if (!row) throw new Error(`Failed to create customer ${name}`);
  return row;
}

async function upsertService(
  companyId: number,
  name: string,
  price: number
) {
  const existing = await db.query.services.findFirst({
    where: and(eq(services.companyId, companyId), eq(services.name, name)),
  });
  if (existing) return existing;

  const [row] = await db
    .insert(services)
    .values({
      companyId,
      name,
      durationMinutes: 30,
      price: String(price),
    })
    .returning();
  if (!row) throw new Error(`Failed to create service ${name}`);
  return row;
}

async function upsertPackage(
  companyId: number,
  serviceId: number,
  name: string,
  totalSessions: number,
  totalPrice: number
) {
  const existing = await db.query.servicePackages.findFirst({
    where: and(
      eq(servicePackages.companyId, companyId),
      eq(servicePackages.name, name)
    ),
  });
  if (existing) return existing;

  const [row] = await db
    .insert(servicePackages)
    .values({
      companyId,
      serviceId,
      name,
      totalSessions,
      totalPrice: String(totalPrice),
      validityDays: 30,
    })
    .returning();
  if (!row) throw new Error(`Failed to create package ${name}`);
  return row;
}

async function main() {
  const password = process.env.DEMO_PASSWORD || randomBytes(18).toString("base64url");

  const user = await upsertUser(
    "demo-admin@example.invalid",
    "Administrador Demo",
    password
  );

  const centro = await upsertCompany(
    "demo-centro@example.invalid",
    "Demo Centro",
    "5511000000001",
    password
  );
  const jardins = await upsertCompany(
    "demo-jardins@example.invalid",
    "Demo Jardins",
    "5511000000002",
    password
  );

  for (const company of [centro, jardins]) {
    await db
      .insert(userCompanies)
      .values({ userId: user.id, companyId: company.id, role: "ADMIN" })
      .onConflictDoNothing({
        target: [userCompanies.userId, userCompanies.companyId],
      });
  }

  const stores = [
    {
      company: centro,
      clientName: "Ana Demo",
      serviceName: "Corte Demo",
      price: 50,
    },
    {
      company: jardins,
      clientName: "Bruno Demo",
      serviceName: "Barba Demo",
      price: 35,
    },
  ];

  for (const store of stores) {
    await upsertCustomer(store.company.id, store.clientName, store.company.phone);
    const service = await upsertService(
      store.company.id,
      store.serviceName,
      store.price
    );
    await upsertPackage(
      store.company.id,
      service.id,
      "Pacote Demo 4 sessões",
      4,
      store.price * 4
    );
  }

  console.log("Demonstração preparada com duas lojas, clientes, serviços e pacotes.");
  console.log("E-mail de teste: demo-admin@example.invalid");
  console.log("Senha de teste:", password);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
