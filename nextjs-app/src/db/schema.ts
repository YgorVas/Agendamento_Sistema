import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  boolean,
  timestamp,
  date,
  numeric,
  pgEnum,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["ADMIN", "GERENTE", "CAIXA"]);
export const appointmentStatusEnum = pgEnum("appointment_status", [
  "agendado",
  "confirmado",
  "concluido",
  "cancelado",
]);
export const packageStatusEnum = pgEnum("package_status", [
  "ativo",
  "concluido",
  "expirado",
]);

export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  legalName: varchar("legal_name", { length: 100 }),
  taxId: varchar("tax_id", { length: 18 }).unique(),
  phone: varchar("phone", { length: 20 }).notNull(),
  email: varchar("email", { length: 100 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  email: varchar("email", { length: 254 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const userCompanies = pgTable(
  "user_companies",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.companyId] }),
    companyIdx: index("idx_user_companies_company").on(
      table.companyId,
      table.userId
    ),
  })
);

export const customers = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull(),
    email: varchar("email", { length: 100 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    companyPhoneIdx: index("idx_customers_company_phone").on(
      table.companyId,
      table.phone
    ),
  })
);

export const services = pgTable("services", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  durationMinutes: integer("duration_minutes").notNull().default(30),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
});

export const servicePackages = pgTable("service_packages", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  serviceId: integer("service_id")
    .notNull()
    .references(() => services.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  totalSessions: integer("total_sessions").notNull(),
  totalPrice: numeric("total_price", { precision: 10, scale: 2 }).notNull(),
  validityDays: integer("validity_days").notNull().default(30),
});

export const customerPackages = pgTable("customer_packages", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  packageId: integer("package_id")
    .notNull()
    .references(() => servicePackages.id, { onDelete: "cascade" }),
  remainingSessions: integer("remaining_sessions").notNull(),
  purchaseDate: timestamp("purchase_date", { mode: "date" }).defaultNow().notNull(),
  validUntil: date("valid_until", { mode: "date" }).notNull(),
  status: packageStatusEnum("status").notNull().default("ativo"),
});

export const appointments = pgTable(
  "appointments",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    legacyServiceId: integer("legacy_service_id").references(() => services.id, {
      onDelete: "set null",
    }),
    legacyPackageId: integer("legacy_package_id").references(
      () => customerPackages.id,
      { onDelete: "set null" }
    ),
    position: integer("position"),
    ticketHash: varchar("ticket_hash", { length: 64 }).unique(),
    attendanceDate: date("attendance_date", { mode: "date" }).notNull(),
    appointmentTime: timestamp("appointment_time", { mode: "date" }).defaultNow().notNull(),
    status: appointmentStatusEnum("status").notNull().default("agendado"),
    reminderSent: boolean("reminder_sent").notNull().default(false),
    reminderSentAt: timestamp("reminder_sent_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    queueIdx: index("idx_appointments_queue").on(
      table.companyId,
      table.attendanceDate,
      table.position
    ),
  })
);

export const appointmentServices = pgTable(
  "appointment_services",
  {
    appointmentId: integer("appointment_id")
      .notNull()
      .references(() => appointments.id, { onDelete: "cascade" }),
    serviceId: integer("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    customerPackageId: integer("customer_package_id").references(
      () => customerPackages.id,
      { onDelete: "set null" }
    ),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.appointmentId, table.serviceId] }),
  })
);

export const serviceRecords = pgTable(
  "service_records",
  {
    appointmentId: integer("appointment_id")
      .notNull()
      .references(() => appointments.id, { onDelete: "cascade" }),
    item: integer("item").notNull(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    customerName: varchar("customer_name", { length: 100 }).notNull(),
    serviceName: varchar("service_name", { length: 100 }).notNull(),
    packageName: varchar("package_name", { length: 100 }),
    value: numeric("value", { precision: 28, scale: 18 }).notNull(),
    completionDate: date("completion_date", { mode: "date" }).notNull(),
    completedAt: timestamp("completed_at", { mode: "date" }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.appointmentId, table.item] }),
    companyDateIdx: index("idx_service_records_company_date").on(
      table.companyId,
      table.completionDate,
      table.completedAt,
      table.appointmentId
    ),
  })
);

export type Company = typeof companies.$inferSelect;
export type User = typeof users.$inferSelect;
export type UserCompany = typeof userCompanies.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Service = typeof services.$inferSelect;
export type ServicePackage = typeof servicePackages.$inferSelect;
export type CustomerPackage = typeof customerPackages.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
export type AppointmentService = typeof appointmentServices.$inferSelect;
export type ServiceRecord = typeof serviceRecords.$inferSelect;
