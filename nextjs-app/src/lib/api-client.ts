export async function apiFetch(
  path: string,
  options?: RequestInit
): Promise<any> {
  const res = await fetch(path, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options?.headers || {}),
    },
    credentials: "include",
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || data === null) {
    const error = new Error(data?.erro || "Não foi possível consultar o sistema.");
    (error as any).status = res.status;
    (error as any).codigo = data?.codigo;
    throw error;
  }
  return data;
}

export function formatCurrency(value: number | string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value));
}

export function todaySP() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
