"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, formatCurrency, todaySP } from "@/lib/api-client";
import { LogOut, Plus, Trash2, RefreshCw } from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"fila" | "balcao" | "catalogo" | "financeiro">("fila");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type?: "error" | "success" } | null>(null);

  const [company, setCompany] = useState<any>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [queue, setQueue] = useState<any[]>([]);
  const [lastTicket, setLastTicket] = useState<any>(null);

  const isManagement = useMemo(
    () => company?.cargo === "ADMIN" || company?.cargo === "GERENTE",
    [company]
  );

  function show(msg: string, type?: "error" | "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  async function loadBase() {
    try {
      const auth = await apiFetch("/api/auth/companies");
      setCompany(auth.comercioAtual);
      const [c, s, p] = await Promise.all([
        apiFetch("/api/clients"),
        apiFetch("/api/services"),
        apiFetch("/api/packages"),
      ]);
      setClients(c);
      setServices(s);
      setPackages(p);
    } catch (err: any) {
      if (err.status === 401 || err.status === 403) {
        router.replace("/login");
      } else {
        show(err.message, "error");
      }
    }
  }

  async function loadQueue() {
    try {
      const data = await apiFetch(`/api/appointments/${todaySP()}`);
      setQueue(data);
    } catch (err: any) {
      show(err.message, "error");
    }
  }

  useEffect(() => {
    loadBase();
  }, []);

  useEffect(() => {
    loadQueue();
    const id = setInterval(loadQueue, 10000);
    return () => clearInterval(id);
  }, []);

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  async function updateStatus(id: number, status: string) {
    setLoading(true);
    try {
      await apiFetch("/api/appointments/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      await loadQueue();
      show("Status atualizado", "success");
    } catch (err: any) {
      show(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  const inProgress = queue.find((a) => a.status === "confirmado");
  const next = queue.find((a) => a.status === "agendado");

  // Counter state
  const [customerId, setCustomerId] = useState("");
  const [newCustomer, setNewCustomer] = useState({ nome: "", telefone: "" });
  const [serviceItems, setServiceItems] = useState<{ servico_id: string; cliente_pacote_id: string }[]>([
    { servico_id: "", cliente_pacote_id: "" },
  ]);
  const [customerPackages, setCustomerPackages] = useState<any[]>([]);

  useEffect(() => {
    if (!customerId || customerId === "new") {
      setCustomerPackages([]);
      return;
    }
    apiFetch(`/api/packages/customer/${customerId}`)
      .then(setCustomerPackages)
      .catch((err) => show(err.message, "error"));
  }, [customerId]);

  function addServiceItem() {
    setServiceItems([...serviceItems, { servico_id: "", cliente_pacote_id: "" }]);
  }

  function removeServiceItem(idx: number) {
    setServiceItems(serviceItems.filter((_, i) => i !== idx));
  }

  function updateServiceItem(idx: number, key: string, value: string) {
    const nextItems = serviceItems.map((item, i) =>
      i === idx ? { ...item, [key]: value, ...(key === "servico_id" ? { cliente_pacote_id: "" } : {}) } : item
    );
    setServiceItems(nextItems);
  }

  async function submitCounter(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      let cid = Number(customerId);
      if (!cid) {
        const res = await apiFetch("/api/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nome: newCustomer.nome,
            telefone_whatsapp: newCustomer.telefone,
          }),
        });
        cid = res.cliente_id;
        setClients((prev) => {
          const idx = prev.findIndex((c) => c.id === res.cliente.id);
          if (idx === -1) return [...prev, res.cliente];
          const next = [...prev];
          next[idx] = res.cliente;
          return next;
        });
      }
      const servicos = serviceItems
        .filter((i) => i.servico_id)
        .map((i) => ({
          servico_id: Number(i.servico_id),
          cliente_pacote_id: i.cliente_pacote_id ? Number(i.cliente_pacote_id) : null,
        }));
      const res = await apiFetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente_id: cid,
          data_atendimento: todaySP(),
          servicos,
        }),
      });
      setLastTicket(res);
      setServiceItems([{ servico_id: "", cliente_pacote_id: "" }]);
      setCustomerId("");
      setNewCustomer({ nome: "", telefone: "" });
      await loadQueue();
      show(res.aviso_cliente, "success");
    } catch (err: any) {
      show(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  // Catalog state
  const [serviceForm, setServiceForm] = useState({ nome: "", descricao: "", duracao_minutos: "", preco: "" });
  const [packageForm, setPackageForm] = useState({
    nome: "",
    descricao: "",
    servico_id: "",
    total_sessoes: "",
    preco_total: "",
    dias_validade: "30",
  });
  const [assignForm, setAssignForm] = useState({ cliente_id: "", pacote_id: "" });

  async function createService(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiFetch("/api/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: serviceForm.nome,
          descricao: serviceForm.descricao,
          duracao_minutos: Number(serviceForm.duracao_minutos),
          preco: Number(serviceForm.preco),
        }),
      });
      setServiceForm({ nome: "", descricao: "", duracao_minutos: "", preco: "" });
      const s = await apiFetch("/api/services");
      setServices(s);
      show("Serviço cadastrado", "success");
    } catch (err: any) {
      show(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function createPackage(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiFetch("/api/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: packageForm.nome,
          descricao: packageForm.descricao,
          servico_id: Number(packageForm.servico_id),
          total_sessoes: Number(packageForm.total_sessoes),
          preco_total: Number(packageForm.preco_total),
          dias_validade: Number(packageForm.dias_validade),
        }),
      });
      setPackageForm({
        nome: "",
        descricao: "",
        servico_id: "",
        total_sessoes: "",
        preco_total: "",
        dias_validade: "30",
      });
      const p = await apiFetch("/api/packages");
      setPackages(p);
      show("Pacote cadastrado", "success");
    } catch (err: any) {
      show(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function assignPackage(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiFetch("/api/packages/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente_id: Number(assignForm.cliente_id),
          pacote_id: Number(assignForm.pacote_id),
        }),
      });
      setAssignForm({ cliente_id: "", pacote_id: "" });
      show("Pacote atribuído", "success");
    } catch (err: any) {
      show(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  // Finance state
  const [summary, setSummary] = useState<any>(null);
  const [period, setPeriod] = useState<any>(null);
  const [periodType, setPeriodType] = useState("mes");
  const [periodDate, setPeriodDate] = useState(todaySP());

  async function loadFinance() {
    try {
      const s = await apiFetch("/api/finance/summary");
      setSummary(s);
      const p = await apiFetch(`/api/finance/period?tipo=${periodType}&data=${periodDate}`);
      setPeriod(p);
    } catch (err: any) {
      show(err.message, "error");
    }
  }

  useEffect(() => {
    if (tab === "financeiro") loadFinance();
  }, [tab]);

  function chartGradient(servicos: any[]) {
    const positive = servicos.filter((s) => Number(s.valor) > 0);
    if (positive.length === 0) return "";
    const total = positive.reduce((sum, s) => sum + Number(s.valor), 0);
    const colors = ["#047857", "#2563eb", "#7c3aed", "#c2410c", "#be185d", "#0e7490"];
    let acc = 0;
    const stops = positive.map((s, i) => {
      const start = (acc / total) * 100;
      acc += Number(s.valor);
      const end = (acc / total) * 100;
      return `${colors[i % colors.length]} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
    });
    return `conic-gradient(${stops.join(", ")})`;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-slate-900 text-white sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="font-bold text-lg">SistemaAgendamento</h1>
            <p className="text-xs text-slate-300">
              {company?.nomeFantasia ?? "..."} · {company?.cargo}
            </p>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 rounded-lg border border-slate-500 px-3 py-2 text-sm hover:bg-slate-800"
          >
            <LogOut size={16} /> Sair
          </button>
        </div>
      </header>

      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 rounded-xl px-4 py-3 shadow-lg text-sm ${
            toast.type === "error" ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"
          }`}
        >
          {toast.msg}
        </div>
      )}

      <main className="flex-1 max-w-7xl mx-auto w-full p-4">
        <nav className="mb-6 grid grid-cols-2 sm:flex gap-2 rounded-2xl border bg-white p-1.5 shadow-sm">
          {[
            { key: "fila", label: "Fila" },
            { key: "balcao", label: "Registrar cliente" },
            ...(isManagement
              ? [
                  { key: "catalogo", label: "Serviços e pacotes" },
                  { key: "financeiro", label: "Financeiro" },
                ]
              : []),
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as any)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                tab === t.key ? "bg-slate-900 text-white" : "hover:bg-slate-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {tab === "fila" && (
          <div className="space-y-6">
            <a
              href={`/fila?empresa=${company?.comercioId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm font-semibold text-brand-600 underline"
            >
              Abrir página de entrada dos clientes
            </a>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                <div className="p-4 border-b bg-emerald-50 flex justify-between items-center">
                  <span className="text-sm font-bold uppercase text-emerald-700">Em Atendimento</span>
                  <span className="bg-emerald-600 text-white text-xs font-bold px-2 py-1 rounded-lg">
                    {inProgress ? `#${inProgress.posicao_fila}` : "Livre"}
                  </span>
                </div>
                <div className="p-6 min-h-[120px] flex items-center justify-center">
                  {inProgress ? (
                    <div>
                      <div className="text-xl font-bold">{inProgress.cliente_nome}</div>
                      <div className="text-xs text-slate-500">{inProgress.cliente_telefone}</div>
                      <div className="text-xs font-medium mt-1">
                        {inProgress.servicos.map((s: any) => s.servico_nome).join(" · ")}
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-400 text-sm">Nenhum cliente em atendimento.</p>
                  )}
                </div>
                <div className="p-4 bg-slate-50 border-t text-right">
                  <button
                    disabled={!inProgress || loading}
                    onClick={() => updateStatus(inProgress.id, "concluido")}
                    className="bg-emerald-600 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Concluir Atendimento
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                <div className="p-4 border-b bg-sky-50 flex justify-between items-center">
                  <span className="text-sm font-bold uppercase text-sky-700">Próximo da Fila</span>
                  <span className="bg-sky-600 text-white text-xs font-bold px-2 py-1 rounded-lg">
                    {next ? `#${next.posicao_fila}` : "--"}
                  </span>
                </div>
                <div className="p-6 min-h-[120px] flex items-center justify-center">
                  {next ? (
                    <div>
                      <div className="text-xl font-bold">{next.cliente_nome}</div>
                      <div className="text-xs text-slate-500">{next.cliente_telefone}</div>
                      <div className="text-xs font-medium mt-1">
                        {next.servicos.map((s: any) => s.servico_nome).join(" · ")}
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-400 text-sm">Não há clientes aguardando.</p>
                  )}
                </div>
                <div className="p-4 bg-slate-50 border-t text-right">
                  <button
                    disabled={!next || !!inProgress || loading}
                    onClick={() => updateStatus(next.id, "confirmado")}
                    className="bg-sky-600 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-sky-700 disabled:opacity-50"
                  >
                    Chamar Próximo
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
              <div className="p-4 border-b flex justify-between items-center">
                <h3 className="font-bold">Fila do dia</h3>
                <span className="text-xs font-semibold bg-slate-100 text-slate-700 px-3 py-1 rounded-lg">
                  {queue.length} clientes
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                    <tr>
                      <th className="px-4 py-3">Pos.</th>
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3">Serviços</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {queue.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-bold">#{item.posicao_fila}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold">{item.cliente_nome}</div>
                          <div className="text-xs text-slate-400">{item.cliente_telefone}</div>
                        </td>
                        <td className="px-4 py-3">
                          <ul className="text-xs space-y-1">
                            {item.servicos.map((s: any) => (
                              <li key={s.servico_id}>
                                {s.servico_nome}
                                {s.cliente_pacote_id && (
                                  <span className="ml-1 bg-purple-100 text-purple-700 px-1 rounded text-[10px]">
                                    Pacote
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={item.status} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          {item.status === "agendado" && (
                            <button
                              onClick={() => updateStatus(item.id, "cancelado")}
                              className="text-xs text-rose-600 hover:text-rose-800 font-semibold"
                            >
                              Cancelar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === "balcao" && (
          <div className="max-w-xl mx-auto space-y-6">
            {lastTicket && (
              <div className="bg-white rounded-2xl border shadow-lg p-6 text-center">
                <p className="text-xs uppercase text-slate-500">Senha gerada</p>
                <div className="text-5xl font-black text-brand-600">#{lastTicket.posicao_fila}</div>
                <p className="text-sm mt-2">{lastTicket.aviso_cliente}</p>
                <a
                  href={`/ticket#${lastTicket.ticket}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-600 underline text-sm"
                >
                  Abrir link do cliente
                </a>
              </div>
            )}

            <form onSubmit={submitCounter} className="bg-white rounded-2xl border shadow-sm p-6 space-y-4">
              <h2 className="text-xl font-bold">Registrar cliente no balcão</h2>
              <div>
                <label className="block text-sm font-medium">Cliente</label>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full rounded-xl border p-2.5"
                  required={!newCustomer.nome}
                >
                  <option value="">Cadastrar novo cliente</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.phone}
                    </option>
                  ))}
                </select>
              </div>
              {customerId === "" && (
                <>
                  <input
                    placeholder="Nome completo"
                    value={newCustomer.nome}
                    onChange={(e) => setNewCustomer({ ...newCustomer, nome: e.target.value })}
                    className="w-full rounded-xl border p-2.5"
                    required
                  />
                  <input
                    placeholder="WhatsApp"
                    value={newCustomer.telefone}
                    onChange={(e) => setNewCustomer({ ...newCustomer, telefone: e.target.value })}
                    className="w-full rounded-xl border p-2.5"
                    required
                  />
                </>
              )}

              <div className="space-y-3">
                <label className="block text-sm font-medium">Serviços</label>
                {serviceItems.map((item, idx) => (
                  <div key={idx} className="rounded-xl border p-3 space-y-2">
                    <select
                      value={item.servico_id}
                      onChange={(e) => updateServiceItem(idx, "servico_id", e.target.value)}
                      className="w-full rounded-xl border p-2"
                      required
                    >
                      <option value="">Selecione o serviço</option>
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} - {formatCurrency(s.price)}
                        </option>
                      ))}
                    </select>
                    <select
                      value={item.cliente_pacote_id}
                      onChange={(e) => updateServiceItem(idx, "cliente_pacote_id", e.target.value)}
                      className="w-full rounded-xl border p-2"
                      disabled={!item.servico_id}
                    >
                      <option value="">Sem pacote</option>
                      {customerPackages
                        .filter(
                          (p) =>
                            String(p.serviceId) === item.servico_id &&
                            p.status === "ativo" &&
                            Number(p.remainingSessions) > 0
                        )
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.packageName} ({p.remainingSessions} restantes)
                          </option>
                        ))}
                    </select>
                    {serviceItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeServiceItem(idx)}
                        className="text-xs text-rose-600 flex items-center gap-1"
                      >
                        <Trash2 size={12} /> Remover
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addServiceItem}
                  disabled={serviceItems.length >= services.length}
                  className="flex items-center gap-1 text-sm font-semibold text-brand-700"
                >
                  <Plus size={14} /> Adicionar serviço
                </button>
              </div>

              <button
                disabled={loading}
                className="w-full bg-brand-600 text-white py-3 rounded-xl font-bold hover:bg-brand-700 disabled:opacity-50"
              >
                {loading ? "Confirmando…" : "Confirmar Entrada na Fila"}
              </button>
            </form>
          </div>
        )}

        {tab === "catalogo" && isManagement && (
          <div className="space-y-8">
            <section className="bg-white rounded-2xl border shadow-sm p-6">
              <h3 className="text-lg font-semibold mb-4">Atribuir pacote a cliente</h3>
              <form onSubmit={assignPackage} className="grid sm:grid-cols-3 gap-4">
                <select
                  value={assignForm.cliente_id}
                  onChange={(e) => setAssignForm({ ...assignForm, cliente_id: e.target.value })}
                  className="rounded-xl border p-2.5"
                  required
                >
                  <option value="">Cliente</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  value={assignForm.pacote_id}
                  onChange={(e) => setAssignForm({ ...assignForm, pacote_id: e.target.value })}
                  className="rounded-xl border p-2.5"
                  required
                >
                  <option value="">Pacote</option>
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  disabled={loading}
                  className="bg-brand-600 text-white rounded-xl font-semibold hover:bg-brand-700 disabled:opacity-50"
                >
                  Atribuir pacote
                </button>
              </form>
            </section>

            <div className="grid lg:grid-cols-2 gap-6">
              <section className="bg-white rounded-2xl border shadow-sm p-6">
                <h3 className="text-lg font-semibold mb-4">Novo serviço</h3>
                <form onSubmit={createService} className="space-y-3">
                  <input
                    placeholder="Nome"
                    value={serviceForm.nome}
                    onChange={(e) => setServiceForm({ ...serviceForm, nome: e.target.value })}
                    className="w-full rounded-xl border p-2.5"
                    required
                  />
                  <input
                    placeholder="Descrição"
                    value={serviceForm.descricao}
                    onChange={(e) => setServiceForm({ ...serviceForm, descricao: e.target.value })}
                    className="w-full rounded-xl border p-2.5"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      placeholder="Duração (min)"
                      type="number"
                      value={serviceForm.duracao_minutos}
                      onChange={(e) => setServiceForm({ ...serviceForm, duracao_minutos: e.target.value })}
                      className="w-full rounded-xl border p-2.5"
                      required
                    />
                    <input
                      placeholder="Preço (R$)"
                      type="number"
                      step="0.01"
                      value={serviceForm.preco}
                      onChange={(e) => setServiceForm({ ...serviceForm, preco: e.target.value })}
                      className="w-full rounded-xl border p-2.5"
                      required
                    />
                  </div>
                  <button
                    disabled={loading}
                    className="bg-brand-600 text-white px-4 py-2 rounded-xl font-semibold hover:bg-brand-700 disabled:opacity-50"
                  >
                    Cadastrar serviço
                  </button>
                </form>
                <h4 className="mt-6 text-sm font-semibold text-slate-500 uppercase">Cadastrados</h4>
                <ul className="mt-2 space-y-2 text-sm">
                  {services.map((s) => (
                    <li key={s.id} className="flex justify-between border-b py-2">
                      <span>{s.name}</span>
                      <span className="font-semibold text-brand-600">{formatCurrency(s.price)}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="bg-white rounded-2xl border shadow-sm p-6">
                <h3 className="text-lg font-semibold mb-4">Novo modelo de pacote</h3>
                <form onSubmit={createPackage} className="space-y-3">
                  <select
                    value={packageForm.servico_id}
                    onChange={(e) => setPackageForm({ ...packageForm, servico_id: e.target.value })}
                    className="w-full rounded-xl border p-2.5"
                    required
                  >
                    <option value="">Serviço do pacote</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="Nome"
                    value={packageForm.nome}
                    onChange={(e) => setPackageForm({ ...packageForm, nome: e.target.value })}
                    className="w-full rounded-xl border p-2.5"
                    required
                  />
                  <div className="grid grid-cols-3 gap-3">
                    <input
                      placeholder="Sessões"
                      type="number"
                      value={packageForm.total_sessoes}
                      onChange={(e) => setPackageForm({ ...packageForm, total_sessoes: e.target.value })}
                      className="w-full rounded-xl border p-2.5"
                      required
                    />
                    <input
                      placeholder="Validade (dias)"
                      type="number"
                      value={packageForm.dias_validade}
                      onChange={(e) => setPackageForm({ ...packageForm, dias_validade: e.target.value })}
                      className="w-full rounded-xl border p-2.5"
                      required
                    />
                    <input
                      placeholder="Preço total"
                      type="number"
                      step="0.01"
                      value={packageForm.preco_total}
                      onChange={(e) => setPackageForm({ ...packageForm, preco_total: e.target.value })}
                      className="w-full rounded-xl border p-2.5"
                      required
                    />
                  </div>
                  <button
                    disabled={loading}
                    className="bg-brand-600 text-white px-4 py-2 rounded-xl font-semibold hover:bg-brand-700 disabled:opacity-50"
                  >
                    Cadastrar pacote
                  </button>
                </form>
                <h4 className="mt-6 text-sm font-semibold text-slate-500 uppercase">Modelos</h4>
                <ul className="mt-2 space-y-2 text-sm">
                  {packages.map((p) => (
                    <li key={p.id} className="flex justify-between border-b py-2">
                      <span>{p.name}</span>
                      <span className="font-semibold text-brand-600">{formatCurrency(p.totalPrice)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        )}

        {tab === "financeiro" && isManagement && summary && period && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Financeiro</h2>
              <button
                onClick={loadFinance}
                className="flex items-center gap-1 rounded-xl border bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-100"
              >
                <RefreshCw size={14} /> Atualizar
              </button>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <Card title="Hoje" value={summary.totais.hoje} qty={summary.totais.qtd_hoje} color="emerald" />
              <Card title="Semana" value={summary.totais.semana} qty={summary.totais.qtd_semana} color="slate" />
              <Card title="Mês" value={summary.totais.mes} qty={summary.totais.qtd_mes} color="slate" />
            </div>

            <div className="bg-white rounded-2xl border shadow-sm p-6">
              <h3 className="font-bold mb-4">Histórico de serviços</h3>
              <div className="flex flex-wrap gap-3 mb-4">
                <select
                  value={periodType}
                  onChange={(e) => setPeriodType(e.target.value)}
                  className="rounded-xl border p-2"
                >
                  <option value="dia">Dia</option>
                  <option value="semana">Semana</option>
                  <option value="mes">Mês</option>
                  <option value="ano">Ano</option>
                </select>
                <input
                  type="date"
                  value={periodDate}
                  onChange={(e) => setPeriodDate(e.target.value)}
                  className="rounded-xl border p-2"
                />
                <button
                  onClick={loadFinance}
                  className="bg-brand-600 text-white px-4 py-2 rounded-xl text-sm font-semibold"
                >
                  Consultar
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <div>
                  <p className="text-sm text-slate-500">Período</p>
                  <p className="font-semibold">
                    {period.periodo.inicio === period.periodo.fim
                      ? period.periodo.inicio
                      : `${period.periodo.inicio} a ${period.periodo.fim}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-500">Total</p>
                  <p className="text-2xl font-bold">{formatCurrency(period.total)}</p>
                </div>
              </div>

              {period.servicos.length > 0 && (
                <div className="grid sm:grid-cols-[auto_1fr] gap-6 items-center">
                  <div
                    className="w-40 h-40 rounded-full mx-auto"
                    style={{ background: chartGradient(period.servicos) }}
                  />
                  <ul className="divide-y text-sm">
                    {period.servicos.map((s: any) => (
                      <li key={s.nome} className="py-2 flex justify-between">
                        <span>{s.nome}</span>
                        <span className="font-semibold">{formatCurrency(s.valor)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-600">
                    <tr>
                      <th className="px-4 py-3">Data</th>
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3">Serviço</th>
                      <th className="px-4 py-3">Origem</th>
                      <th className="px-4 py-3 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {period.registros.map((r: any, i: number) => (
                      <tr key={i}>
                        <td className="px-4 py-3">{r.data_conclusao}</td>
                        <td className="px-4 py-3">{r.cliente_nome}</td>
                        <td className="px-4 py-3 font-semibold">{r.servico_nome}</td>
                        <td className="px-4 py-3 text-slate-600">{r.pacote_nome ?? "Avulso"}</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatCurrency(r.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    agendado: "bg-amber-100 text-amber-800",
    confirmado: "bg-emerald-100 text-emerald-800",
    concluido: "bg-slate-100 text-slate-600",
    cancelado: "bg-rose-100 text-rose-700",
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${map[status] || "bg-slate-100"}`}>
      {status}
    </span>
  );
}

function Card({
  title,
  value,
  qty,
  color,
}: {
  title: string;
  value: string;
  qty: number;
  color: "emerald" | "slate";
}) {
  const bg = color === "emerald" ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-200";
  return (
    <div className={`rounded-2xl border p-5 ${bg}`}>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-2xl font-bold mt-4">{formatCurrency(value)}</p>
      <p className="text-sm text-slate-600 mt-1">{qty} serviço(s)</p>
    </div>
  );
}
