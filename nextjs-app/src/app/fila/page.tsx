"use client";

import { Suspense } from "react";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, formatCurrency } from "@/lib/api-client";

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
  const [packages, setPackages] = useState<any[]>([]);
  const [selectedPackages, setSelectedPackages] = useState<
    Record<number, string>
  >({});
  const [name, setName] = useState("");
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

  useEffect(() => {
    if (!companyId || !/^\d+$/.test(companyId)) return;
    if (phone.replace(/\D/g, "").length < 10) {
      setPackages([]);
      setSelectedPackages({});
      return;
    }

    let active = true;
    const timer = setTimeout(() => {
      apiFetch(
        `/api/public-queue/${companyId}/packages?telefone=${encodeURIComponent(phone)}`
      )
        .then((rows) => {
          if (!active) return;
          setPackages(rows);
          setSelectedPackages((prev) => {
            const next: Record<number, string> = {};
            for (const row of rows) {
              const chosen = prev[row.serviceId];
              if (chosen && String(row.id) === chosen) {
                next[row.serviceId] = chosen;
              }
            }
            return next;
          });
        })
        .catch(() => {
          if (active) {
            setPackages([]);
            setSelectedPackages({});
          }
        });
    }, 400);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [phone, companyId]);

  function toggleService(id: number) {
    if (selected.includes(id)) {
      setSelected(selected.filter((x) => x !== id));
      setSelectedPackages((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } else {
      setSelected([...selected, id]);
    }
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
      const servicos = selected.map((id) => ({
        servico_id: id,
        cliente_pacote_id: selectedPackages[id]
          ? Number(selectedPackages[id])
          : null,
      }));
      await apiFetch(`/api/public-queue/${companyId}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: name.trim(),
          telefone_whatsapp: phone.trim(),
          servicos,
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
    <main className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-lg p-6 mt-10">
        <h1 className="text-2xl font-bold mb-1">Entrar na fila</h1>
        {catalog && (
          <p className="text-sm text-slate-500 mb-6">{catalog.nome_fantasia}</p>
        )}
        {error && <p className="text-sm text-rose-600 mb-4">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Nome completo</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border p-2.5"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium">WhatsApp com DDD</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border p-2.5"
              required
            />
            {packages.length > 0 && (
              <p className="mt-1 text-xs text-emerald-700">
                Encontramos pacotes ativos para este WhatsApp. Selecione um
                serviço para usá-los.
              </p>
            )}
          </div>
          <fieldset>
            <legend className="text-sm font-medium">Serviços</legend>
            <div className="mt-2 space-y-2">
              {catalog?.servicos?.map((s: any) => {
                const servicePackages = packages.filter(
                  (p) => p.serviceId === s.id
                );
                return (
                  <div key={s.id} className="space-y-2">
                    <label className="flex items-center gap-3 rounded-xl border p-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected.includes(s.id)}
                        onChange={() => toggleService(s.id)}
                      />
                      <span className="flex-1 text-sm">
                        {s.name} · {formatCurrency(s.price)}
                      </span>
                    </label>
                    {selected.includes(s.id) && servicePackages.length > 0 && (
                      <div className="pl-7">
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          Pacote
                        </label>
                        <select
                          value={selectedPackages[s.id] ?? ""}
                          onChange={(e) =>
                            setSelectedPackages((prev) => ({
                              ...prev,
                              [s.id]: e.target.value,
                            }))
                          }
                          className="w-full rounded-xl border p-2.5 text-sm"
                        >
                          <option value="">Sem pacote — pagar no local</option>
                          {servicePackages.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.packageName} · {p.remainingSessions} sessão(ões)
                              restante(s)
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
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
