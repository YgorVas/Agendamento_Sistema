import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth";

export default async function Home() {
  const token = (await cookies()).get("auth-token")?.value;
  if (token && verifyAccessToken(token)) {
    redirect("/dashboard");
  }
  redirect("/login");
}
