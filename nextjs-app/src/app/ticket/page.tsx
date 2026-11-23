"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";

export default function TicketPage() {
  const [status, setStatus] = useState("Carregando ticket…");
  const [position, setPosition] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const cancelled = useRef(false);

  useEffect(() => {
    if (done) return;
    const token = window.location.hash.slice(1);
    if (!/^[0-9a-f]{64}$/.test(token)) {
      setStatus("Abra o link do ticket fornecido pelo estabelecimento.");
      setDone(true);
      return;
    }

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const data = await apiFetch("/api/appointments/ticket", {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (controller.signal.aborted || cancelled.current) return;
        setWaiting(data.status === "agendado");
        setPosition(data.posicao_fila);
        const messages: Record<string, string> = {
          agendado:
            data.pessoas_na_frente === 0
              ? "Você é o próximo da fila."
              : `${data.pessoas_na_frente} pessoa(s) à sua frente.`,
          confirmado: "É a sua vez. Dirija-se ao local do atendimento.",
          concluido: "Seu atendimento foi concluído.",
          cancelado: "Seu atendimento foi cancelado.",
        };
        setStatus(messages[data.status] ?? "Aguardando…");
        if (data.status === "concluido" || data.status === "cancelado") {
          setDone(true);
          return;
        }
      } catch (err: any) {
        if (controller.signal.aborted || cancelled.current) return;
        if (err.status === 404) {
          setStatus("Ticket não encontrado.");
          setDone(true);
          return;
        }
        setStatus("Falha ao atualizar o ticket. Tentando novamente…");
      }
      timer = setTimeout(poll, 5000);
    }

    poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [done]);

  async function cancelEntry() {
    if (cancelling || !window.confirm("Cancelar sua entrada na fila?")) return;
    setCancelling(true);
    setCancelError("");
    try {
      await apiFetch("/api/appointments/ticket", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${window.location.hash.slice(1)}` },
      });
      cancelled.current = true;
      setStatus("Seu atendimento foi cancelado.");
      setDone(true);
    } catch (err: any) {
      setCancelError(err.message);
    } finally {
      setCancelling(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-sm w-full">
        <h1 className="text-xl font-bold mb-4">Acompanhamento da fila</h1>
        {position !== null && (
          <p className="text-3xl font-black text-brand-600 mb-2">#{position}</p>
        )}
        <p role="status" className="text-slate-600">{status}</p>
        {waiting && !done && (
          <button
            onClick={cancelEntry}
            disabled={cancelling}
            className="mt-5 w-full rounded-xl border border-rose-200 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
          >
            {cancelling ? "Cancelando…" : "Cancelar entrada"}
          </button>
        )}
        {cancelError && <p role="alert" className="mt-3 text-sm text-rose-700">{cancelError}</p>}
      </div>
    </main>
  );
}
