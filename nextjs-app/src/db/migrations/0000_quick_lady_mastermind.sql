DO $$ BEGIN
 CREATE TYPE "appointment_status" AS ENUM('agendado', 'confirmado', 'concluido', 'cancelado');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "package_status" AS ENUM('ativo', 'concluido', 'expirado');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "role" AS ENUM('ADMIN', 'GERENTE', 'CAIXA');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "appointment_services" (
	"appointment_id" integer NOT NULL,
	"service_id" integer NOT NULL,
	"customer_package_id" integer,
	CONSTRAINT "appointment_services_appointment_id_service_id_pk" PRIMARY KEY("appointment_id","service_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "appointments" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"legacy_service_id" integer,
	"legacy_package_id" integer,
	"position" integer,
	"ticket_hash" varchar(64),
	"attendance_date" date NOT NULL,
	"appointment_time" timestamp DEFAULT now() NOT NULL,
	"status" "appointment_status" DEFAULT 'agendado' NOT NULL,
	"reminder_sent" boolean DEFAULT false NOT NULL,
	"reminder_sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_ticket_hash_unique" UNIQUE("ticket_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"legal_name" varchar(100),
	"tax_id" varchar(18),
	"phone" varchar(20) NOT NULL,
	"email" varchar(100) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "companies_tax_id_unique" UNIQUE("tax_id"),
	CONSTRAINT "companies_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_packages" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"package_id" integer NOT NULL,
	"remaining_sessions" integer NOT NULL,
	"purchase_date" timestamp DEFAULT now() NOT NULL,
	"valid_until" date NOT NULL,
	"status" "package_status" DEFAULT 'ativo' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"email" varchar(100),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_packages" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"service_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"total_sessions" integer NOT NULL,
	"total_price" numeric(10, 2) NOT NULL,
	"validity_days" integer DEFAULT 30 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_records" (
	"appointment_id" integer NOT NULL,
	"item" integer NOT NULL,
	"company_id" integer NOT NULL,
	"customer_name" varchar(100) NOT NULL,
	"service_name" varchar(100) NOT NULL,
	"package_name" varchar(100),
	"value" numeric(28, 18) NOT NULL,
	"completion_date" date NOT NULL,
	"completed_at" timestamp NOT NULL,
	CONSTRAINT "service_records_appointment_id_item_pk" PRIMARY KEY("appointment_id","item")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "services" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"price" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_companies" (
	"user_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"role" "role" NOT NULL,
	CONSTRAINT "user_companies_user_id_company_id_pk" PRIMARY KEY("user_id","company_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"email" varchar(254) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_appointments_queue" ON "appointments" ("company_id","attendance_date","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_customers_company_phone" ON "customers" ("company_id","phone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_service_records_company_date" ON "service_records" ("company_id","completion_date","completed_at","appointment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_companies_company" ON "user_companies" ("company_id","user_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_customer_package_id_customer_packages_id_fk" FOREIGN KEY ("customer_package_id") REFERENCES "customer_packages"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointments" ADD CONSTRAINT "appointments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointments" ADD CONSTRAINT "appointments_legacy_service_id_services_id_fk" FOREIGN KEY ("legacy_service_id") REFERENCES "services"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointments" ADD CONSTRAINT "appointments_legacy_package_id_customer_packages_id_fk" FOREIGN KEY ("legacy_package_id") REFERENCES "customer_packages"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_packages" ADD CONSTRAINT "customer_packages_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_packages" ADD CONSTRAINT "customer_packages_package_id_service_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "service_packages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customers" ADD CONSTRAINT "customers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_packages" ADD CONSTRAINT "service_packages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_packages" ADD CONSTRAINT "service_packages_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_records" ADD CONSTRAINT "service_records_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_records" ADD CONSTRAINT "service_records_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "services" ADD CONSTRAINT "services_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_companies" ADD CONSTRAINT "user_companies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_companies" ADD CONSTRAINT "user_companies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
