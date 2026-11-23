import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32),
  TRUSTED_CLIENT_IP_HEADER: z.string().regex(/^[a-z0-9-]+$/i).optional(),
  PILOT_SUPPORT_EMAIL: z.string().email().optional(),
  WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_COMPANY_ID: z.string().optional(),
  WHATSAPP_API_VERSION: z.string().optional(),
  PUBLIC_BASE_URL: z.string().optional(),
  DEMO_PASSWORD: z.string().optional(),
});

export const env = envSchema.parse(process.env);
