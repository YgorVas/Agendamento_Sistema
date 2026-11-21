import { cookies } from "next/headers";

export function setAuthCookie(token: string) {
  const oneHour = 60 * 60;
  cookies().set("auth-token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: oneHour,
  });
}

export function clearAuthCookie() {
  cookies().delete("auth-token");
}
