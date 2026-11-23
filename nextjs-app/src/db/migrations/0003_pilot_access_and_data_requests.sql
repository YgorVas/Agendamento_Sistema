CREATE TYPE "public"."company_invite_kind" AS ENUM('cadastro', 'nova-loja');--> statement-breakpoint
CREATE TYPE "public"."data_request_kind" AS ENUM('exportacao', 'exclusao');--> statement-breakpoint
CREATE TYPE "public"."data_request_status" AS ENUM('pendente', 'atendida', 'recusada');--> statement-breakpoint
CREATE TABLE "company_invites" (
	"token_hash" varchar(64) PRIMARY KEY NOT NULL,
	"email" varchar(100) NOT NULL,
	"kind" "company_invite_kind" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_data_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"customer_id" integer,
	"requested_by" integer,
	"kind" "data_request_kind" NOT NULL,
	"status" "data_request_status" DEFAULT 'pendente' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "password_resets_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"attempts" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "session_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_data_requests" ADD CONSTRAINT "customer_data_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_data_requests" ADD CONSTRAINT "customer_data_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_data_requests" ADD CONSTRAINT "customer_data_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_data_requests_company" ON "customer_data_requests" USING btree ("company_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_data_requests_pending" ON "customer_data_requests" USING btree ("company_id","customer_id","kind") WHERE "customer_data_requests"."status" = 'pendente';--> statement-breakpoint
CREATE INDEX "idx_rate_limits_expires" ON "rate_limits" USING btree ("expires_at");