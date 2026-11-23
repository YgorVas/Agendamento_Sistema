"use client";

import { useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api-client";

export function RecoveryForm() {
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState(false);
  const [saving, setSaving] = useState(false);

  async function recover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    if (fields.get("senha") !== fields.get("confirmacao")) {
      setError("As senhas precisam ser iguais.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await apiFetch("/api/auth/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: fields.get("codigo"), senha: fields.get("senha") }),
      });
      setCompleted(true);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (completed) return <p role="status" className="text-sm text-emerald-700">Senha redefinida. Entre novamente com a nova senha.</p>;

  const inputClass = "mt-1 w-full rounded-xl border p-2.5";
  return (
    <form onSubmit={recover} className="space-y-4">
      <label className="block text-sm font-medium">
        Código de recuperação
        <input name="codigo" required autoComplete="off" spellCheck={false} className={inputClass} />
      </label>
      <label className="block text-sm font-medium">
        Nova senha
        <input name="senha" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
      </label>
      <label className="block text-sm font-medium">
        Confirme a nova senha
        <input name="confirmacao" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
      </label>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <button type="submit" disabled={saving} className="w-full rounded-xl bg-brand-600 py-2.5 font-semibold text-white disabled:opacity-50">
        {saving ? "Salvando…" : "Redefinir senha"}
      </button>
    </form>
  );
}
