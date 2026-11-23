"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, formatCurrency, todaySP } from "@/lib/api-client";
import { mobilePhoneHint, mobilePhonePattern } from "@/lib/phone";
import { ChartColumn, Layers, ListOrdered, LogOut, Menu, Plus, RefreshCw, Trash2, UserPlus, Users } from "lucide-react";
import type { Customer, Service, ServicePackage } from "@/db/schema";
import { CustomersPanel } from "./customers-panel";
import { CompanySwitcher, type CompanyMembership } from "./company-switcher";
import { CustomerDataRequests } from "./customer-data-requests";

type CatalogPackage = Omit<ServicePackage, "available">;
type DashboardTab = "fila" | "balcao" | "clientes" | "catalogo" | "financeiro";
type QueueService = {
  servico_id: number;
  servico_nome: string;
  cliente_pacote_id: number | null;
};
type QueueEntry = {
  id: number;
  status: string;
  posicao_fila: number;
  cliente_id: number;
  cliente_nome: string;
  cliente_telefone: string;
  duracao_minutos: number;
  servicos: QueueService[];
};
type PackageSelection = { servico_id: number; cliente_pacote_id: number };
type CustomerPackageOption = {
  id: number;
  serviceId: number;
  packageName: string;
  remainingSessions: number;
  status: string;
};

const emptyServiceForm = { nome: "", descricao: "", duracao_minutos: "", preco: "" };
const emptyPackageForm = {
  nome: "",
  descricao: "",
  servico_id: "",
  total_sessoes: "",
  preco_total: "",
  dias_validade: "30",
};

export default function DashboardPage() {
  const router = useRouter();
  const [tab, setTab] = useState<DashboardTab>("fila");
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type?: "error" | "success" } | null>(null);

  const [company, setCompany] = useState<CompanyMembership | null>(null);
  const [companies, setCompanies] = useState<CompanyMembership[]>([]);
  const [userName, setUserName] = useState("");
  const [clients, setClients] = useState<Customer[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [packages, setPackages] = useState<CatalogPackage[]>([]);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
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
      setCompanies(auth.comercios);
      setUserName(auth.usuarioNome ?? "");
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

  async function updateStatus(id: number, status: string, pacotes?: PackageSelection[]) {
    if (status === "cancelado" && !window.confirm("Cancelar esta entrada na fila?")) return;
    setLoading(true);
    try {
      await apiFetch("/api/appointments/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, pacotes }),
      });
      await loadQueue();
      show(status === "cancelado" ? "Entrada cancelada" : "Status atualizado", "success");
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
  const [newCustomer, setNewCustomer] = useState({ nome: "", sobrenome: "", telefone: "" });
  const [serviceItems, setServiceItems] = useState<{ servico_id: string; cliente_pacote_id: string }[]>([
    { servico_id: "", cliente_pacote_id: "" },
  ]);
  const [customerPackages, setCustomerPackages] = useState<any[]>([]);

  useEffect(() => {
    setCustomerPackages([]);
    if (tab !== "balcao" || !customerId) return;

    const controller = new AbortController();
    apiFetch(`/api/packages/customer/${customerId}`, { signal: controller.signal })
      .then(setCustomerPackages)
      .catch((err) => {
        if (!controller.signal.aborted) show(err.message, "error");
      });
    return () => controller.abort();
  }, [customerId, tab]);

  function clearRemovedPackage(id: number) {
    setServiceItems((current) => current.map((item) =>
      item.cliente_pacote_id === String(id) ? { ...item, cliente_pacote_id: "" } : item
    ));
  }

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

  async function submitCounter(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const registerOnly = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "register-only";
    setLoading(true);
    try {
      let cid = Number(customerId);
      if (!cid) {
        const res = await apiFetch("/api/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nome: newCustomer.nome,
            sobrenome: newCustomer.sobrenome,
            telefone_whatsapp: newCustomer.telefone,
          }),
        });
        cid = res.cliente_id;
        setClients((current) => [
          ...current.filter((client) => client.id !== res.cliente_id),
          res.cliente,
        ]);
        if (registerOnly) {
          setLastTicket(null);
          setCustomerId(String(cid));
          setNewCustomer({ nome: "", sobrenome: "", telefone: "" });
          setSelectedClientId(cid);
          show(res.mensagem, "success");
          return;
        }
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
      setNewCustomer({ nome: "", sobrenome: "", telefone: "" });
      await loadQueue();
      show(res.aviso_cliente, "success");
    } catch (err: any) {
      show(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  // Catalog state
  const [serviceForm, setServiceForm] = useState(emptyServiceForm);
  const [packageForm, setPackageForm] = useState(emptyPackageForm);
  const [editingServiceId, setEditingServiceId] = useState<number | null>(null);
  const [editingPackageId, setEditingPackageId] = useState<number | null>(null);
  const [savingCatalog, setSavingCatalog] = useState(false);
  const serviceNameInput = useRef<HTMLInputElement>(null);
  const packageNameInput = useRef<HTMLInputElement>(null);

  function editService(service: Service) {
    setEditingServiceId(service.id);
    setServiceForm({
      nome: service.name,
      descricao: service.description ?? "",
      duracao_minutos: String(service.durationMinutes),
      preco: service.price,
    });
    serviceNameInput.current?.focus();
  }

  function resetServiceForm() {
    setEditingServiceId(null);
    setServiceForm(emptyServiceForm);
  }

  function editPackage(pkg: CatalogPackage) {
    setEditingPackageId(pkg.id);
    setPackageForm({
      nome: pkg.name,
      descricao: pkg.description ?? "",
      servico_id: String(pkg.serviceId),
      total_sessoes: String(pkg.totalSessions),
      preco_total: pkg.totalPrice,
      dias_validade: String(pkg.validityDays),
    });
    packageNameInput.current?.focus();
  }

  function resetPackageForm() {
    setEditingPackageId(null);
    setPackageForm(emptyPackageForm);
  }

  async function saveService(e: React.FormEvent) {
    e.preventDefault();
    setSavingCatalog(true);
    try {
      const saved = await apiFetch("/api/services", {
        method: editingServiceId === null ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingServiceId ?? undefined,
          nome: serviceForm.nome,
          descricao: serviceForm.descricao,
          duracao_minutos: Number(serviceForm.duracao_minutos),
          preco: Number(serviceForm.preco),
        }),
      });
      resetServiceForm();
      if (editingServiceId === null) {
        setServices(await apiFetch("/api/services"));
        show("Serviço cadastrado", "success");
      } else {
        setServices((current) => current
          .map((service) => service.id === editingServiceId ? saved as Service : service)
          .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
        show("Serviço atualizado", "success");
      }
    } catch (err: any) {
      show(err.message, "error");
    } finally {
      setSavingCatalog(false);
    }
  }

  async function savePackage(e: React.FormEvent) {
    e.preventDefault();
    setSavingCatalog(true);
    try {
      const saved = await apiFetch("/api/packages", {
        method: editingPackageId === null ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingPackageId ?? undefined,
          nome: packageForm.nome,
          descricao: packageForm.descricao,
          servico_id: Number(packageForm.servico_id),
          total_sessoes: Number(packageForm.total_sessoes),
          preco_total: Number(packageForm.preco_total),
          dias_validade: Number(packageForm.dias_validade),
        }),
      });
      resetPackageForm();
      if (editingPackageId === null) {
        setPackages(await apiFetch("/api/packages"));
        show("Pacote cadastrado", "success");
      } else {
        setPackages((current) => current.map((pkg) => pkg.id === editingPackageId ? saved as CatalogPackage : pkg));
        show("Pacote atualizado", "success");
      }
    } catch (err: any) {
      show(err.message, "error");
    } finally {
      setSavingCatalog(false);
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

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-brand-500 bg-brand-600 text-white">
        <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]">
          <div className="lg:col-start-2 lg:text-center">
            <h1 className="text-3xl font-bold tracking-tight">Agendai</h1>
            {company && (
              <p className="mt-1 flex items-center gap-2 text-sm text-brand-50 lg:justify-center">
                <span className="min-w-0 break-words">{userName}</span>
                <span aria-hidden="true" className="shrink-0 text-brand-500">•</span>
                <span className="min-w-0 break-words">{company.nomeFantasia}</span>
              </p>
            )}
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={logout}
              aria-label="Sair"
              title="Sair"
              className="flex items-center gap-2 rounded-lg border border-brand-500 px-3 py-2 text-sm hover:bg-brand-700"
            >
              <LogOut size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Sair</span>
            </button>
            {company && <CompanySwitcher companies={companies} currentCompany={company} />}
          </div>
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

      <div className="mx-auto grid w-full max-w-7xl flex-1 content-start gap-4 p-4 md:grid-cols-[13rem_minmax(0,1fr)] lg:gap-6">
        <aside className="self-start rounded-2xl border border-brand-100 bg-white p-2 shadow-sm md:sticky md:top-4">
          <button
            type="button"
            aria-controls="menu-painel"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-brand-600 hover:bg-brand-50 md:hidden"
          >
            <Menu size={18} aria-hidden="true" /> Menu do painel
          </button>
          <nav id="menu-painel" aria-label="Menu do painel" className={`${menuOpen ? "mt-2 flex" : "hidden"} flex-col gap-1 md:mt-0 md:flex`}>
            {([
              { key: "fila", label: "Fila", icon: ListOrdered },
              { key: "balcao", label: "Registrar cliente", icon: UserPlus },
              ...(isManagement
                ? ([
                    { key: "clientes", label: "Clientes", icon: Users },
                    { key: "catalogo", label: "Serviços e pacotes", icon: Layers },
                    { key: "financeiro", label: "Financeiro", icon: ChartColumn },
                  ] as const)
                : []),
            ] satisfies { key: DashboardTab; label: string; icon: typeof Menu }[]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                aria-current={tab === key ? "page" : undefined}
                onClick={() => {
                  setTab(key);
                  setMenuOpen(false);
                  if (menuOpen) document.getElementById("conteudo-painel")?.focus();
                }}
                className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-brand-600 ${
                  tab === key ? "bg-brand-500" : "hover:bg-brand-50"
                }`}
              >
                <Icon size={18} aria-hidden="true" className="shrink-0" /> {label}
              </button>
            ))}
          </nav>
        </aside>

        <main id="conteudo-painel" tabIndex={-1} className="min-w-0">

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
              <form
                key={inProgress?.id ?? "idle"}
                className="bg-white rounded-2xl border shadow-sm overflow-hidden"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!inProgress || loading) return;
                  const values = new FormData(event.currentTarget);
                  const selections = inProgress.servicos.flatMap((service) => {
                    const id = Number(values.get(`pacote-${service.servico_id}`));
                    return id ? [{ servico_id: service.servico_id, cliente_pacote_id: id }] : [];
                  });
                  void updateStatus(inProgress.id, "concluido", selections);
                }}
              >
                <div className="p-4 border-b bg-emerald-50 flex justify-between items-center">
                  <span className="text-sm font-bold uppercase text-emerald-700">Em Atendimento</span>
                  <span className="bg-emerald-600 text-white text-xs font-bold px-2 py-1 rounded-lg">
                    {inProgress ? `#${inProgress.posicao_fila}` : "Livre"}
                  </span>
                </div>
                <div className="p-6 min-h-[120px] flex items-center justify-center">
                  {inProgress ? (
                    <div className="w-full">
                      <div className="text-xl font-bold">{inProgress.cliente_nome}</div>
                      <div className="text-xs text-slate-500">{inProgress.cliente_telefone}</div>
                      <AttendancePackages entry={inProgress} disabled={loading} />
                    </div>
                  ) : (
                    <p className="text-slate-400 text-sm">Nenhum cliente em atendimento.</p>
                  )}
                </div>
                <div className="p-4 bg-slate-50 border-t text-right">
                  <button
                    disabled={!inProgress || loading}
                    type="submit"
                    className="bg-emerald-600 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Concluir Atendimento
                  </button>
                </div>
              </form>

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
                        {next.servicos.map((s) => s.servico_nome).join(" · ")}
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-400 text-sm">Não há clientes aguardando.</p>
                  )}
                </div>
                <div className="p-4 bg-slate-50 border-t flex flex-wrap justify-end gap-2">
                  {next && (
                    <button
                      disabled={loading}
                      onClick={() => updateStatus(next.id, "cancelado")}
                      className="px-4 py-2 rounded-xl text-sm font-semibold text-rose-700 border border-rose-200 hover:bg-rose-50 disabled:opacity-50"
                    >
                      Cancelar entrada
                    </button>
                  )}
                  <button
                    disabled={!next || !!inProgress || loading}
                    onClick={() => next && updateStatus(next.id, "confirmado")}
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
                            {item.servicos.map((s) => (
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
                              disabled={loading}
                              onClick={() => updateStatus(item.id, "cancelado")}
                              className="text-xs text-rose-600 hover:text-rose-800 font-semibold disabled:opacity-50"
                            >
                              Cancelar entrada
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
                    aria-label="Nome"
                    placeholder="Nome"
                    autoComplete="given-name"
                    maxLength={100}
                    pattern={".*\\S.*"}
                    value={newCustomer.nome}
                    onChange={(e) => setNewCustomer({ ...newCustomer, nome: e.target.value })}
                    className="w-full rounded-xl border p-2.5"
                    required
                  />
                  <input
                    aria-label="Sobrenome"
                    placeholder="Sobrenome"
                    autoComplete="family-name"
                    maxLength={100}
                    pattern={".*\\S.*"}
                    value={newCustomer.sobrenome}
                    onChange={(e) => setNewCustomer({ ...newCustomer, sobrenome: e.target.value })}
                    className="w-full rounded-xl border p-2.5"
                    required
                  />
                  <input
                    aria-label="WhatsApp com DDD"
                    placeholder="WhatsApp com DDD (82 988887777)"
                    autoComplete="tel-national"
                    title={mobilePhoneHint}
                    pattern={mobilePhonePattern}
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

              <div className="flex flex-col gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-brand-600 text-white py-3 rounded-xl font-bold hover:bg-brand-700 disabled:opacity-50"
                >
                  Confirmar Entrada na Fila
                </button>
                {isManagement && customerId === "" && (
                  <button
                    type="submit"
                    value="register-only"
                    formNoValidate
                    disabled={loading}
                    className="w-full rounded-xl border border-brand-600 py-3 font-bold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
                  >
                    Cadastrar sem entrar na fila
                  </button>
                )}
              </div>
            </form>
          </div>
        )}

        {tab === "clientes" && isManagement && (
          <div className="space-y-6">
            <CustomersPanel
              clients={clients}
              packages={packages}
              selectedId={selectedClientId}
              onSelect={setSelectedClientId}
              onPackageRemoved={clearRemovedPackage}
            />
            {company?.cargo === "ADMIN" && (
              <CustomerDataRequests key={company.comercioId} customer={clients.find((client) => client.id === selectedClientId)} />
            )}
          </div>
        )}

        {tab === "catalogo" && isManagement && (
          <div className="space-y-8">
            <div className="grid lg:grid-cols-2 gap-6">
              <section className="bg-white rounded-2xl border shadow-sm p-6">
                <h3 className="text-lg font-semibold mb-4">{editingServiceId === null ? "Novo serviço" : "Editar serviço"}</h3>
                <form onSubmit={saveService}>
                  <fieldset disabled={loading || savingCatalog} className="min-w-0 space-y-3">
                    <input
                      ref={serviceNameInput}
                      aria-label="Nome do serviço"
                      placeholder="Nome"
                      maxLength={100}
                      value={serviceForm.nome}
                      onChange={(e) => setServiceForm({ ...serviceForm, nome: e.target.value })}
                      className="w-full rounded-xl border p-2.5"
                      required
                    />
                    <input
                      aria-label="Descrição do serviço"
                      placeholder="Descrição"
                      maxLength={2000}
                      value={serviceForm.descricao}
                      onChange={(e) => setServiceForm({ ...serviceForm, descricao: e.target.value })}
                      className="w-full rounded-xl border p-2.5"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <label className="text-sm">
                        Duração (min)
                        <input
                          type="number"
                          min="1"
                          value={serviceForm.duracao_minutos}
                          onChange={(e) => setServiceForm({ ...serviceForm, duracao_minutos: e.target.value })}
                          className="w-full rounded-xl border p-2.5"
                          required
                        />
                      </label>
                      <label className="text-sm">
                        Preço (R$)
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={serviceForm.preco}
                          onChange={(e) => setServiceForm({ ...serviceForm, preco: e.target.value })}
                          className="w-full rounded-xl border p-2.5"
                          required
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button className="bg-brand-600 text-white px-4 py-2 rounded-xl font-semibold hover:bg-brand-700 disabled:opacity-50">
                        {editingServiceId === null ? "Cadastrar serviço" : "Salvar serviço"}
                      </button>
                      {editingServiceId !== null && (
                        <button type="button" onClick={resetServiceForm} className="rounded-xl border px-4 py-2 font-semibold hover:bg-slate-50 disabled:opacity-50">
                          Cancelar
                        </button>
                      )}
                    </div>
                  </fieldset>
                </form>
                <h4 className="mt-6 text-sm font-semibold text-slate-500 uppercase">Cadastrados</h4>
                <ul className="mt-2 space-y-2 text-sm">
                  {services.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2">
                      <span className="min-w-0 break-words">{s.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-brand-600">{formatCurrency(s.price)}</span>
                        <button type="button" aria-label={`Editar serviço ${s.name}`} disabled={loading || savingCatalog} onClick={() => editService(s)} className="rounded-lg border px-3 py-1 font-semibold hover:bg-slate-50 disabled:opacity-50">
                          Editar
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="bg-white rounded-2xl border shadow-sm p-6">
                <h3 className="text-lg font-semibold mb-4">{editingPackageId === null ? "Novo modelo de pacote" : "Editar modelo de pacote"}</h3>
                <form onSubmit={savePackage}>
                  <fieldset disabled={loading || savingCatalog} className="min-w-0 space-y-3">
                    <label className="block text-sm">
                      Serviço do pacote
                      <select
                        value={packageForm.servico_id}
                        onChange={(e) => setPackageForm({ ...packageForm, servico_id: e.target.value })}
                        className="w-full rounded-xl border p-2.5"
                        required
                      >
                        <option value="">Selecione um serviço</option>
                        {services.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <input
                      ref={packageNameInput}
                      aria-label="Nome do pacote"
                      placeholder="Nome"
                      maxLength={100}
                      value={packageForm.nome}
                      onChange={(e) => setPackageForm({ ...packageForm, nome: e.target.value })}
                      className="w-full rounded-xl border p-2.5"
                      required
                    />
                    <input
                      aria-label="Descrição do pacote"
                      placeholder="Descrição"
                      maxLength={2000}
                      value={packageForm.descricao}
                      onChange={(e) => setPackageForm({ ...packageForm, descricao: e.target.value })}
                      className="w-full rounded-xl border p-2.5"
                    />
                    <div className="grid grid-cols-3 gap-3">
                      <label className="text-sm">
                        Sessões
                        <input
                          type="number"
                          min="1"
                          value={packageForm.total_sessoes}
                          onChange={(e) => setPackageForm({ ...packageForm, total_sessoes: e.target.value })}
                          className="w-full rounded-xl border p-2.5"
                          required
                        />
                      </label>
                      <label className="text-sm">
                        Validade (dias)
                        <input
                          type="number"
                          min="1"
                          value={packageForm.dias_validade}
                          onChange={(e) => setPackageForm({ ...packageForm, dias_validade: e.target.value })}
                          className="w-full rounded-xl border p-2.5"
                          required
                        />
                      </label>
                      <label className="text-sm">
                        Preço (R$)
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={packageForm.preco_total}
                          onChange={(e) => setPackageForm({ ...packageForm, preco_total: e.target.value })}
                          className="w-full rounded-xl border p-2.5"
                          required
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button className="bg-brand-600 text-white px-4 py-2 rounded-xl font-semibold hover:bg-brand-700 disabled:opacity-50">
                        {editingPackageId === null ? "Cadastrar pacote" : "Salvar pacote"}
                      </button>
                      {editingPackageId !== null && (
                        <button type="button" onClick={resetPackageForm} className="rounded-xl border px-4 py-2 font-semibold hover:bg-slate-50 disabled:opacity-50">
                          Cancelar
                        </button>
                      )}
                    </div>
                  </fieldset>
                </form>
                <h4 className="mt-6 text-sm font-semibold text-slate-500 uppercase">Modelos</h4>
                <ul className="mt-2 space-y-2 text-sm">
                  {packages.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2">
                      <span className="min-w-0 break-words">{p.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-brand-600">{formatCurrency(p.totalPrice)}</span>
                        <button type="button" aria-label={`Editar pacote ${p.name}`} disabled={loading || savingCatalog} onClick={() => editPackage(p)} className="rounded-lg border px-3 py-1 font-semibold hover:bg-slate-50 disabled:opacity-50">
                          Editar
                        </button>
                      </div>
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
                <FinanceServiceChart services={period.servicos} />
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
    </div>
  );
}

const financeChartColors = ["#047857", "#2563eb", "#7c3aed", "#c2410c", "#be185d", "#0e7490"];

function FinanceServiceChart({ services }: { services: { nome: string; valor: string }[] }) {
  const total = services.reduce((sum, { valor }) => sum + Math.max(0, Number(valor)), 0);
  const stops: string[] = [];
  let accumulated = 0;
  const legend = services.map((service) => {
    const amount = Number(service.valor);
    if (amount <= 0) return { ...service, color: null };

    const index = stops.length;
    const color = financeChartColors[index] ?? `hsl(${(index * 137.508) % 360} 64% 44%)`;
    const start = (accumulated / total) * 100;
    accumulated += amount;
    stops.push(`${color} ${start}% ${(accumulated / total) * 100}%`);
    return { ...service, color };
  });

  return (
    <div className={stops.length ? "grid sm:grid-cols-[auto_1fr] gap-6 items-center" : undefined}>
      {stops.length > 0 && (
        <div
          aria-hidden="true"
          className="w-40 h-40 rounded-full mx-auto"
          style={{ background: `conic-gradient(${stops.join(", ")})` }}
        />
      )}
      <ul aria-label="Valores por serviço" className="divide-y text-sm">
        {legend.map(({ nome, valor, color }) => (
          <li key={nome} className="flex items-center gap-2 py-2">
            <span
              aria-hidden="true"
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: color ?? "#cbd5e1" }}
            />
            <span className="min-w-0 flex-1 break-words">{nome}</span>
            <span className="shrink-0 font-semibold tabular-nums">{formatCurrency(valor)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AttendancePackages({ entry, disabled }: { entry: QueueEntry; disabled: boolean }) {
  const [packages, setPackages] = useState<CustomerPackageOption[]>([]);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const hasUncoveredService = entry.servicos.some((service) => service.cliente_pacote_id === null);

  useEffect(() => {
    if (!hasUncoveredService) return;
    const controller = new AbortController();
    setPending(true);
    setError(false);
    apiFetch(`/api/packages/customer/${entry.cliente_id}`, { signal: controller.signal })
      .then((rows: CustomerPackageOption[]) => {
        if (!controller.signal.aborted) {
          setPackages(rows.filter((pkg) => pkg.status === "ativo" && pkg.remainingSessions > 0));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
    return () => controller.abort();
  }, [entry.cliente_id, hasUncoveredService, attempt]);

  return (
    <div className="mt-3 space-y-2 text-sm">
      {entry.servicos.map((service) => {
        const options = packages.filter((pkg) => pkg.serviceId === service.servico_id);
        if (service.cliente_pacote_id !== null) {
          return <p key={service.servico_id}>{service.servico_nome} · Pacote registrado</p>;
        }
        if (!options.length) return <p key={service.servico_id}>{service.servico_nome}</p>;
        return (
          <label key={service.servico_id} className="block font-medium">
            {service.servico_nome}
            <select
              name={`pacote-${service.servico_id}`}
              className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
              disabled={disabled}
            >
              <option value="">Sem pacote</option>
              {options.map((pkg) => (
                <option key={pkg.id} value={pkg.id}>
                  {pkg.packageName} ({pkg.remainingSessions} {pkg.remainingSessions === 1 ? "sessão restante" : "sessões restantes"})
                </option>
              ))}
            </select>
          </label>
        );
      })}
      {hasUncoveredService && pending && <p role="status">Consultando pacotes…</p>}
      {error && (
        <button
          type="button"
          className="text-rose-700 underline"
          onClick={() => setAttempt((current) => current + 1)}
        >
          Falha ao consultar pacotes. Tentar novamente
        </button>
      )}
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
