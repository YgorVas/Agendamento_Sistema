"use client";

import { useRef, useState, type FormEvent } from "react";
import { Building2, Check, ChevronDown, Plus } from "lucide-react";
import { apiFetch } from "@/lib/api-client";

const inputClass = "mt-1 w-full rounded-xl border p-2.5";

export type CompanyMembership = {
  comercioId: number;
  nomeFantasia: string;
  cargo: "ADMIN" | "GERENTE" | "CAIXA";
};

export function CompanySwitcher({
  companies,
  currentCompany,
}: {
  companies: CompanyMembership[];
  currentCompany: CompanyMembership;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function switchCompany(comercioId: number) {
    if (saving || comercioId === currentCompany.comercioId) return;
    setError("");
    setSaving(true);

    try {
      await apiFetch("/api/auth/select", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comercioId }),
      });
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível trocar de empresa.");
      setSaving(false);
    }
  }

  async function createCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const fields = new FormData(event.currentTarget);
    setError("");
    setSaving(true);

    try {
      await apiFetch("/api/auth/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(fields)),
      });
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar a empresa.");
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        aria-label="Selecionar empresa"
        aria-haspopup="dialog"
        title="Selecionar empresa"
        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-100"
      >
        <Building2 size={16} aria-hidden="true" />
        <span className="hidden sm:inline">Empresas</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="company-switcher-title"
        className="w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white p-6 text-slate-800 shadow-lg backdrop:bg-slate-900/60"
        onCancel={(event) => {
          if (saving) event.preventDefault();
        }}
        onClose={() => {
          setCreating(false);
          setError("");
        }}
      >
        <h2 id="company-switcher-title" className="text-xl font-bold">
          {creating ? "Cadastrar nova empresa" : "Empresas"}
        </h2>
        {creating ? (
          <form onSubmit={createCompany} className="mt-4 space-y-4">
            <label className="block text-sm font-medium">
              Nome da empresa
              <input autoFocus name="empresa" maxLength={100} required className={inputClass} />
            </label>
            <label className="block text-sm font-medium">
              E-mail da nova empresa
              <input name="email" type="email" maxLength={100} required className={inputClass} />
            </label>
            <label className="block text-sm font-medium">
              WhatsApp da empresa
              <input name="telefone" type="tel" maxLength={20} required className={inputClass} />
            </label>
            <label className="block text-sm font-medium">
              Código do convite da nova empresa
              <input name="convite" autoComplete="off" spellCheck={false} required className={inputClass} />
            </label>
            {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => dialog.current?.close()}
                disabled={saving}
                className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {saving ? "Criando…" : "Criar empresa"}
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-4 space-y-4">
            <ul className="max-h-60 space-y-2 overflow-y-auto">
              {companies.map((company) => {
                const active = company.comercioId === currentCompany.comercioId;
                return (
                  <li key={company.comercioId}>
                    {active ? (
                      <div className="flex items-center gap-2 rounded-xl bg-brand-50 p-3 text-sm text-brand-600">
                        <Check size={16} className="shrink-0" aria-hidden="true" />
                        <span className="min-w-0 flex-1 break-words font-semibold">{company.nomeFantasia}</span>
                        <span className="shrink-0">Atual</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => switchCompany(company.comercioId)}
                        disabled={saving}
                        className="w-full break-words rounded-xl border p-3 text-left text-sm font-semibold hover:bg-brand-50 disabled:opacity-50"
                      >
                        {company.nomeFantasia}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {saving && <p role="status" className="text-sm">Trocando de empresa…</p>}
            {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              {currentCompany.cargo === "ADMIN" && (
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setCreating(true);
                  }}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  <Plus size={16} aria-hidden="true" /> Cadastrar nova empresa
                </button>
              )}
              <button
                type="button"
                onClick={() => dialog.current?.close()}
                disabled={saving}
                className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
