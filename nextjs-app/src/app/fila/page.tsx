"use client";

import { Suspense } from "react";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, formatCurrency } from "@/lib/api-client";
import { mobilePhoneHint, mobilePhonePattern } from "@/lib/phone";

export const dynamic = "force-dynamic";

export default function PublicQueuePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center">
          <p className="text-slate-600">Carregando…</p>
        </main>
      }
    >
      <PublicQueueContent />
    </Suspense>
  );
}

function PublicQueueContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const companyId = searchParams.get("empresa");

  const [catalog, setCatalog] = useState<any>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!companyId || !/^\d+$/.test(companyId)) {
      setError("Abra o link de entrada fornecido pelo estabelecimento.");
      return;
    }
    apiFetch(`/api/public-queue/${companyId}/services`)
      .then(setCatalog)
      .catch((err) => setError(err.message));
  }, [companyId]);

  function toggleService(id: number) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selected.length === 0) {
      setError("Selecione pelo menos um serviço.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const ticket = generateTicket();
      await apiFetch(`/api/public-queue/${companyId}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: name.trim(),
          sobrenome: surname.trim(),
          telefone_whatsapp: phone,
          servico_ids: selected,
          ticket,
        }),
      });
      localStorage.setItem("last-ticket", ticket);
      router.replace(`/ticket#${ticket}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (error && !catalog) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <p className="text-slate-600 text-center">{error}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-lg p-6 mt-10">
        <h1 className="text-2xl font-bold mb-1">Entrar na fila</h1>
        {catalog && (
          <p className="text-sm text-slate-500 mb-6">{catalog.nome_fantasia}</p>
        )}
        {error && <p className="text-sm text-rose-600 mb-4">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="nome" className="block text-sm font-medium">Nome</label>
            <input
              id="nome"
              autoComplete="given-name"
              maxLength={100}
              pattern={".*\\S.*"}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border p-2.5"
              required
            />
          </div>
          <div>
            <label htmlFor="sobrenome" className="block text-sm font-medium">Sobrenome</label>
            <input
              id="sobrenome"
              autoComplete="family-name"
              maxLength={100}
              pattern={".*\\S.*"}
              value={surname}
              onChange={(e) => setSurname(e.target.value)}
              className="w-full rounded-xl border p-2.5"
              required
            />
          </div>
          <div>
            <label htmlFor="whatsapp" className="block text-sm font-medium">WhatsApp com DDD</label>
            <input
              id="whatsapp"
              autoComplete="tel-national"
              placeholder="82 988887777"
              title={mobilePhoneHint}
              pattern={mobilePhonePattern}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border p-2.5"
              required
            />
          </div>
          <fieldset>
            <legend className="text-sm font-medium">Serviços</legend>
            <div className="mt-2 space-y-2">
              {catalog?.servicos?.map((s: any) => (
                <label
                  key={s.id}
                  className="flex items-center gap-3 rounded-xl border p-3 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(s.id)}
                    onChange={() => toggleService(s.id)}
                  />
                  <span className="flex-1 text-sm">
                    {s.name} · {formatCurrency(s.price)}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <button
            disabled={loading}
            className="w-full bg-brand-600 text-white py-3 rounded-xl font-bold hover:bg-brand-700 disabled:opacity-50"
          >
            {loading ? "Registrando…" : "Entrar na fila"}
          </button>
        </form>
      </div>
    </main>
  );
}

function generateTicket(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
