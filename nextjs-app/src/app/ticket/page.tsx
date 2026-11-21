"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

export default function TicketPage() {
  const [status, setStatus] = useState("Carregando ticket…");
  const [position, setPosition] = useState<number | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const token = window.location.hash.slice(1);
    if (!/^[0-9a-f]{64}$/.test(token)) {
      setStatus("Abra o link do ticket fornecido pelo estabelecimento.");
      setDone(true);
      return;
    }

    async function poll() {
      try {
        const data = await apiFetch("/api/appointments/ticket", {
          headers: { Authorization: `Bearer ${token}` },
        });
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
        if (err.status === 404) {
          setStatus("Ticket não encontrado.");
          setDone(true);
          return;
        }
        setStatus("Falha ao atualizar o ticket. Tentando novamente…");
      }
      setTimeout(poll, 5000);
    }

    poll();
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-sm w-full">
        <h1 className="text-xl font-bold mb-4">Acompanhamento da fila</h1>
        {position !== null && (
          <p className="text-3xl font-black text-brand-600 mb-2">#{position}</p>
        )}
        <p className="text-slate-600">{status}</p>
      </div>
    </main>
  );
}
