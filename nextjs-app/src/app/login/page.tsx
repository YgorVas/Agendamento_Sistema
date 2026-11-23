"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register" | "select">("login");
  const [selection, setSelection] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch("/api/auth/companies", { method: "GET" })
      .then(() => router.replace("/dashboard"))
      .catch(() => {});
  }, [router]);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: fd.get("email"),
          senha: fd.get("senha"),
        }),
      });
      if (res.token) {
        router.replace("/dashboard");
        return;
      }
      setSelection(res);
      setMode("select");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSelect(comercioId: number) {
    setError("");
    setLoading(true);
    try {
      await apiFetch("/api/auth/select", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${selection.tokenTemporario}`,
        },
        body: JSON.stringify({ comercioId }),
      });
      router.replace("/dashboard");
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      await apiFetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa: fd.get("empresa"),
          nome: fd.get("nome"),
          email: fd.get("email"),
          telefone: fd.get("telefone"),
          senha: fd.get("senha"),
          convite: fd.get("convite"),
        }),
      });
      router.replace("/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <p className="mb-6 text-center text-3xl font-bold tracking-tight text-brand-600">Agendai</p>
        {mode === "login" && (
          <>
            <h1 className="text-2xl font-bold mb-1">Entrar no painel</h1>
            <p className="text-sm text-slate-500 mb-6">
              Use o e-mail e a senha da sua conta.
            </p>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium">E-mail</label>
                <input
                  name="email"
                  type="email"
                  required
                  className="w-full rounded-xl border p-2.5"
                />
              </div>
              <div>
                <label className="block text-sm font-medium">Senha</label>
                <input
                  name="senha"
                  type="password"
                  required
                  className="w-full rounded-xl border p-2.5"
                />
              </div>
              {error && <p className="text-sm text-rose-600">{error}</p>}
              <button
                disabled={loading}
                className="w-full rounded-xl bg-brand-600 text-white py-2.5 font-semibold hover:bg-brand-700 disabled:opacity-50"
              >
                {loading ? "Entrando…" : "Entrar"}
              </button>
            </form>
            <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm">
              <button
                onClick={() => { setError(""); setMode("register"); }}
                className="text-brand-600 font-semibold hover:underline"
              >
                Cadastrar empresa com convite
              </button>
              <Link href="/recuperar-acesso" className="font-semibold text-brand-600 hover:underline">
                Esqueci minha senha
              </Link>
            </div>
          </>
        )}

        {mode === "register" && (
          <>
            <h1 className="text-2xl font-bold mb-1">Cadastre sua empresa</h1>
            <form onSubmit={handleRegister} className="space-y-4 mt-4">
              <input
                name="empresa"
                placeholder="Nome da empresa"
                required
                className="w-full rounded-xl border p-2.5"
              />
              <input
                name="nome"
                placeholder="Seu nome"
                required
                className="w-full rounded-xl border p-2.5"
              />
              <input
                name="email"
                type="email"
                placeholder="E-mail"
                required
                className="w-full rounded-xl border p-2.5"
              />
              <input
                name="telefone"
                placeholder="WhatsApp"
                required
                className="w-full rounded-xl border p-2.5"
              />
              <label className="block text-sm font-medium">
                Código do convite
                <input name="convite" required autoComplete="off" spellCheck={false} className="mt-1 w-full rounded-xl border p-2.5" />
              </label>
              <input
                name="senha"
                type="password"
                placeholder="Senha (mínimo 8 caracteres)"
                minLength={8}
                required
                className="w-full rounded-xl border p-2.5"
              />
              {error && <p className="text-sm text-rose-600">{error}</p>}
              <button
                disabled={loading}
                className="w-full rounded-xl bg-brand-600 text-white py-2.5 font-semibold hover:bg-brand-700 disabled:opacity-50"
              >
                {loading ? "Criando…" : "Criar empresa"}
              </button>
            </form>
            <p className="mt-4 text-center text-sm">
              <button
                onClick={() => { setError(""); setMode("login"); }}
                className="text-slate-600 hover:underline"
              >
                Voltar ao login
              </button>
            </p>
          </>
        )}

        {mode === "select" && selection && (
          <>
            <h1 className="text-2xl font-bold mb-1">Escolha uma loja</h1>
            <div className="space-y-2 mt-4">
              {selection.comercios.map((c: any) => (
                <button
                  key={c.comercioId}
                  disabled={loading}
                  onClick={() => handleSelect(c.comercioId)}
                  className="w-full flex items-center justify-between rounded-xl border p-4 hover:bg-slate-50 text-left"
                >
                  <span className="font-semibold">{c.nomeFantasia}</span>
                  <span className="text-xs uppercase text-slate-500">{c.cargo}</span>
                </button>
              ))}
            </div>
            {error && <p className="text-sm text-rose-600 mt-2">{error}</p>}
            <button
              onClick={() => setMode("login")}
              className="mt-4 w-full rounded-xl border py-2 text-sm font-semibold"
            >
              Voltar
            </button>
          </>
        )}
      </div>
    </main>
  );
}
