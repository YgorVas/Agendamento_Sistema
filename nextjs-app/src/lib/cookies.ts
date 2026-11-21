import { cookies } from "next/headers";

export async function setAuthCookie(token: string) {
  const oneHour = 60 * 60;
  const store = await cookies();
  store.set("auth-token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: oneHour,
  });
}

export async function clearAuthCookie() {
  const store = await cookies();
  store.delete("auth-token");
}
