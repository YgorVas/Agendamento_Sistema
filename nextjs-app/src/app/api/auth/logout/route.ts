export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { clearAuthCookie } from "@/lib/cookies";

export async function POST() {
  await clearAuthCookie();
  return NextResponse.json({ mensagem: "Sessão encerrada." });
}
