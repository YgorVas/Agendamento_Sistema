"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Customer, CustomerPackage, ServicePackage } from "@/db/schema";
import { apiFetch, formatCurrency } from "@/lib/api-client";
import { normalizePhoneDigits, phoneVariants } from "@/lib/phone";

type CustomerAssignment = Pick<CustomerPackage, "id" | "remainingSessions"> & {
  packageName: string;
  totalSessions: number;
  validUntil: string;
  status: Exclude<CustomerPackage["status"], "cancelado">;
};

type CatalogPackage = Pick<ServicePackage, "id" | "name" | "totalPrice">;

const statusLabel: Record<CustomerAssignment["status"], string> = {
  ativo: "Ativo",
  concluido: "Concluído",
  expirado: "Expirado",
};

function normalizeName(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function CustomersPanel({
  clients,
  packages,
  selectedId,
  onSelect,
  onPackageRemoved,
}: {
  clients: Customer[];
  packages: CatalogPackage[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onPackageRemoved: (id: number) => void;
}) {
  const [search, setSearch] = useState("");
  const selected = clients.find((client) => client.id === selectedId);
  const terms = normalizeName(search).trim().split(/\s+/);
  const phoneSearch = /^[\d\s()+.-]+$/.test(search) ? normalizePhoneDigits(search) : "";
  const matches = clients.filter((client) => {
    const name = normalizeName(client.name);
    return terms.every((term) => name.includes(term)) ||
      (phoneSearch !== "" && phoneVariants(client.phone).some((phone) => phone.includes(phoneSearch)));
  });

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <section className="min-w-0 rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold">Clientes</h2>
        <label htmlFor="customer-search" className="mt-4 block text-sm font-medium">
          Buscar por nome ou telefone
        </label>
        <input
          id="customer-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mt-1 w-full rounded-xl border p-2.5"
        />
        {matches.length ? (
          <ul className="mt-4 max-h-96 divide-y overflow-y-auto">
            {matches.map((client) => (
              <li key={client.id}>
                <button
                  type="button"
                  aria-pressed={client.id === selectedId}
                  onClick={() => onSelect(client.id)}
                  className={`w-full rounded-lg px-3 py-2.5 text-left ${client.id === selectedId ? "bg-brand-100 text-brand-700" : "hover:bg-slate-50"}`}
                >
                  <span className="block break-words font-semibold">{client.name}</span>
                  <span className="block text-sm text-slate-600">{client.phone}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-slate-600" role="status">Nenhum cliente encontrado.</p>
        )}
      </section>
      {selected ? (
        <ClientPackages
          key={selected.id}
          client={selected}
          packages={packages}
          onPackageRemoved={onPackageRemoved}
        />
      ) : (
        <p className="rounded-2xl border bg-white p-5 text-sm text-slate-600 shadow-sm">
          Selecione um cliente para gerenciar os pacotes.
        </p>
      )}
    </div>
  );
}

function ClientPackages({
  client,
  packages,
  onPackageRemoved,
}: {
  client: Customer;
  packages: CatalogPackage[];
  onPackageRemoved: (id: number) => void;
}) {
  const endpoint = `/api/packages/customer/${client.id}`;
  const [assignments, setAssignments] = useState<CustomerAssignment[] | null>(null);
  const [listError, setListError] = useState("");
  const [revision, setRevision] = useState(0);
  const [packageId, setPackageId] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch(endpoint, { signal: controller.signal })
      .then((result) => setAssignments(result))
      .catch((error) => {
        if (!controller.signal.aborted) setListError(error.message);
      });
    return () => controller.abort();
  }, [endpoint, revision]);

  function refreshAssignments() {
    setAssignments(null);
    setListError("");
    setRevision((current) => current + 1);
  }

  async function assignPackage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving || !packageId) return;
    setSaving(true);
    setFeedback(null);
    try {
      await apiFetch("/api/packages/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente_id: client.id, pacote_id: Number(packageId) }),
      });
      setPackageId("");
      refreshAssignments();
      setFeedback({ text: "Pacote atribuído ao cliente." });
    } catch (error) {
      setFeedback({ text: (error as Error).message, error: true });
    } finally {
      setSaving(false);
    }
  }

  async function removePackage(assignment: CustomerAssignment) {
    if (saving || !window.confirm(`Remover o pacote “${assignment.packageName}” de ${client.name}?`)) return;
    setSaving(true);
    setFeedback(null);
    try {
      await apiFetch(`${endpoint}?pacote=${assignment.id}`, { method: "DELETE" });
      setAssignments((current) => current?.filter((item) => item.id !== assignment.id) ?? null);
      onPackageRemoved(assignment.id);
      setFeedback({ text: "Pacote removido do cliente." });
    } catch (error) {
      setFeedback({ text: (error as Error).message, error: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="min-w-0 space-y-5 rounded-2xl border bg-white p-5 shadow-sm">
      <div>
        <h2 className="break-words text-xl font-bold">{client.name}</h2>
        <p className="text-sm text-slate-600">{client.phone}</p>
      </div>
      {packages.length ? (
        <form onSubmit={assignPackage}>
          <label htmlFor="customer-package" className="block text-sm font-medium">Pacote</label>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <select
              id="customer-package"
              value={packageId}
              onChange={(e) => setPackageId(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border p-2.5"
              disabled={saving}
              required
            >
              <option value="">Selecione um pacote</option>
              {packages.map((pkg) => (
                <option key={pkg.id} value={pkg.id}>{pkg.name} · {formatCurrency(pkg.totalPrice)}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={saving || !packageId}
              className="rounded-xl bg-brand-600 px-4 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Atribuir pacote
            </button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-slate-600">Nenhum modelo de pacote disponível para atribuição.</p>
      )}
      {feedback && (
        <p role={feedback.error ? "alert" : "status"} className={feedback.error ? "text-sm text-rose-700" : "text-sm text-emerald-700"}>
          {feedback.text}
        </p>
      )}
      <div className="border-t pt-4">
        <h3 className="font-semibold">Pacotes do cliente</h3>
        {listError ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <p role="alert" className="text-rose-700">{listError}</p>
            <button type="button" onClick={refreshAssignments} className="font-semibold text-brand-700">
              Tentar novamente
            </button>
          </div>
        ) : assignments === null ? (
          <p role="status" className="mt-2 text-sm text-slate-600">Carregando pacotes…</p>
        ) : assignments.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">Nenhum pacote atribuído.</p>
        ) : (
          <ul className="mt-2 divide-y">
            {assignments.map((assignment) => (
              <li key={assignment.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="break-words font-medium">{assignment.packageName}</p>
                  <p className="text-sm text-slate-600">
                    {statusLabel[assignment.status]} · {assignment.remainingSessions} de {assignment.totalSessions} sessões restantes
                    {" · Validade "}{assignment.validUntil.slice(0, 10).split("-").reverse().join("/")}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  aria-label={`Remover pacote ${assignment.packageName}`}
                  onClick={() => removePackage(assignment)}
                  className="rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
