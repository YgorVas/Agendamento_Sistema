"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Customer } from "@/db/schema";
import { apiFetch } from "@/lib/api-client";

type DataRequest = {
  id: number;
  tipo: "exportacao" | "exclusao";
  status: "pendente" | "atendida" | "recusada";
  cliente: string | null;
  criada_em: string;
};

const endpoint = "/api/clients/data-requests";
const kinds = { exportacao: "Exportação", exclusao: "Exclusão" };
const statusLabels = { pendente: "Pendente", atendida: "Atendida", recusada: "Recusada" };
const dates = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });

export function CustomerDataRequests({ customer }: { customer?: Customer }) {
  const [requests, setRequests] = useState<DataRequest[] | null>(null);
  const [feedback, setFeedback] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [listError, setListError] = useState("");
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch(endpoint, { signal: controller.signal })
      .then((rows) => { setRequests(rows); setListError(""); })
      .catch((error) => { if (!controller.signal.aborted) setListError(error.message); });
    return () => controller.abort();
  }, [revision]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customer || saving) return;
    const data = new FormData(event.currentTarget);
    setSaving(true);
    setFeedback("");
    setSubmitError("");
    try {
      const result = await apiFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente_id: customer.id, tipo: data.get("tipo") }),
      });
      setFeedback(`Solicitação nº ${result.id} enviada ao suporte.`);
      setRevision((value) => value + 1);
    } catch (error) {
      setSubmitError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="text-xl font-bold">Solicitações de dados de clientes</h2>
      <p className="my-2 text-sm text-slate-600">O suporte revisa as solicitações. Acompanhe o andamento nesta tela.</p>
      {customer ? (
        <form key={customer.id} onSubmit={submit} className="mb-4 flex flex-wrap items-end gap-2">
          <label className="text-sm font-medium">
            Solicitar para {customer.name}
            <select name="tipo" required defaultValue="" className="mt-1 block w-full rounded-xl border p-2.5">
              <option value="" disabled>Selecione o tipo</option>
              <option value="exportacao">Exportação de dados</option>
              <option value="exclusao">Exclusão de dados</option>
            </select>
          </label>
          <button type="submit" disabled={saving} className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Enviando…" : "Enviar solicitação"}
          </button>
        </form>
      ) : <p className="mb-4 text-sm text-slate-600">Selecione um cliente para abrir uma solicitação.</p>}
      {feedback && <p role="status" className="mb-3 text-sm text-emerald-700">{feedback}</p>}
      {submitError && <p role="alert" className="mb-3 text-sm text-rose-700">{submitError}</p>}
      <div className="border-t pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-semibold">Histórico da loja</h3>
          <button type="button" className="text-sm font-semibold text-brand-700 hover:underline" onClick={() => setRevision((value) => value + 1)}>
            Atualizar
          </button>
        </div>
        {listError && <p role="alert" className="mt-2 text-sm text-rose-700">{listError}</p>}
        {!listError && requests === null && <p role="status" className="mt-2 text-sm text-slate-600">Carregando solicitações…</p>}
        {requests?.length === 0 && <p className="mt-2 text-sm text-slate-600">Nenhuma solicitação registrada.</p>}
        {!!requests?.length && (
          <ul className="mt-2 max-h-72 divide-y overflow-y-auto">
            {requests.map((request) => (
              <li key={request.id} className="py-2 text-sm">
                <p className="font-medium">Nº {request.id} · {kinds[request.tipo]} · {statusLabels[request.status]}</p>
                <p className="text-slate-600">{request.cliente ?? "Cadastro indisponível"} · {dates.format(new Date(request.criada_em))}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
