import { createHash, randomBytes } from "crypto";

export function generateTicket(): string {
  return randomBytes(32).toString("hex");
}

export function hashTicket(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
