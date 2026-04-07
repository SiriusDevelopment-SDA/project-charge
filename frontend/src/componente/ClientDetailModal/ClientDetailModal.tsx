import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Phone,
  MessageSquareText,
  CircleDollarSign,
  IdCard,
  CalendarClock,
  X,
  Send,
  HandshakeIcon,
  ClipboardList,
  Loader2,
  Plus,
} from "lucide-react";
import type {
  Cliente,
  PaymentPromise,
  ClientInteraction,
  CreatePaymentPromisePayload,
  CreateClientInteractionPayload,
  InteractionType,
  InteractionOutcome,
} from "../../types";
import { CollectionService } from "../../services/collection/collection.service";
import { calcularDividaCliente, faturasVencidas } from "../../utils/filtrosClientesVencidos";
import { toast } from "react-toastify";
import styles from "./ClientDetailModal.module.css";

type Tab = "invoices" | "promises" | "interactions" | "dispatches";

type Props = {
  cliente: Cliente;
  companyId: string;
  open: boolean;
  onClose: () => void;
};

const PROMISE_STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  kept: "Cumprida",
  broken: "Quebrada",
  cancelled: "Cancelada",
};

const INTERACTION_TYPE_LABEL: Record<string, string> = {
  call: "Ligação",
  whatsapp: "WhatsApp",
  email: "E-mail",
  visit: "Visita",
  other: "Outro",
};

const INTERACTION_OUTCOME_LABEL: Record<string, string> = {
  payment_promise: "Promessa de pagamento",
  no_contact: "Sem contato",
  agreement: "Acordo",
  refused: "Recusou",
  other: "Outro",
};

export function ClientDetailModal({ cliente, companyId, open, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("invoices");
  const [promises, setPromises] = useState<PaymentPromise[]>([]);
  const [interactions, setInteractions] = useState<ClientInteraction[]>([]);
  const [dispatchCount, setDispatchCount] = useState<number>(0);
  const [lastDispatch, setLastDispatch] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [showNewInteraction, setShowNewInteraction] = useState(false);
  const [interactionType, setInteractionType] = useState<InteractionType>("call");
  const [interactionOutcome, setInteractionOutcome] = useState<InteractionOutcome>("no_contact");
  const [interactionDesc, setInteractionDesc] = useState("");
  const [savingInteraction, setSavingInteraction] = useState(false);

  const [showNewPromise, setShowNewPromise] = useState(false);
  const [promiseDate, setPromiseDate] = useState("");
  const [promiseAmount, setPromiseAmount] = useState("");
  const [savingPromise, setSavingPromise] = useState(false);

  const invoices = cliente.invoices?.list ?? [];
  const overdueInvoices = invoices.filter(faturasVencidas);
  const totalDebt = calcularDividaCliente(overdueInvoices.length ? overdueInvoices : invoices);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      CollectionService.getPromisesByClient(cliente.id).then(setPromises).catch(() => {}),
      CollectionService.getInteractionsByClient(cliente.id).then(setInteractions).catch(() => {}),
      cliente.whatsapp
        ? CollectionService.getDispatchSummary(cliente.whatsapp, companyId).then((s) => {
            setDispatchCount(s.total);
            setLastDispatch(s.last_sent_at);
          }).catch(() => {})
        : Promise.resolve(),
    ]).finally(() => setLoading(false));
  }, [open, cliente.id, cliente.whatsapp, companyId]);

  async function handleSaveInteraction() {
    if (!interactionDesc.trim()) {
      toast.warning("Preencha a descrição do atendimento.");
      return;
    }
    setSavingInteraction(true);
    try {
      const payload: CreateClientInteractionPayload = {
        client_id: cliente.id,
        company_id: companyId,
        type: interactionType,
        outcome: interactionOutcome,
        description: interactionDesc,
      };
      const created = await CollectionService.createInteraction(payload);
      setInteractions((prev) => [created, ...prev]);
      setShowNewInteraction(false);
      setInteractionDesc("");
      toast.success("Atendimento registrado!");
    } catch {
      toast.error("Erro ao registrar atendimento.");
    } finally {
      setSavingInteraction(false);
    }
  }

  async function handleSavePromise() {
    if (!promiseDate) {
      toast.warning("Informe a data da promessa.");
      return;
    }
    setSavingPromise(true);
    try {
      const payload: CreatePaymentPromisePayload = {
        client_id: cliente.id,
        total_debt: totalDebt,
        open_invoices_count: overdueInvoices.length || invoices.length,
        promised_payment_date: promiseDate,
        promised_amount: promiseAmount ? Number(promiseAmount) : undefined,
        company_id: companyId,
        phone: cliente.whatsapp,
        client_name: cliente.name,
      };
      const created = await CollectionService.createPromise(payload);
      setPromises((prev) => [created, ...prev]);
      setShowNewPromise(false);
      setPromiseDate("");
      setPromiseAmount("");
      toast.success("Promessa de pagamento registrada!");
    } catch {
      toast.error("Erro ao registrar promessa.");
    } finally {
      setSavingPromise(false);
    }
  }

  async function handleUpdatePromiseStatus(id: string, status: PaymentPromise["status"]) {
    try {
      const updated = await CollectionService.updatePromiseStatus(id, status);
      setPromises((prev) => prev.map((p) => (p.id === id ? updated : p)));
      toast.success("Status atualizado!");
    } catch {
      toast.error("Erro ao atualizar status.");
    }
  }

  if (!open) return null;

  return createPortal(
    <div className={styles.overlay}>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.container} onClick={(e) => e.stopPropagation()}>
        {/* HEADER */}
        <div className={styles.header}>
          <div className={styles.headerInfo}>
            <h2 className={styles.clientName}>{cliente.name}</h2>
            <div className={styles.headerMeta}>
              <span><IdCard size={13} /> {cliente.cnpj_cpf}</span>
              <span><Phone size={13} /> {cliente.whatsapp ?? "—"}</span>
              <span><CircleDollarSign size={13} /> R$ {totalDebt.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span><MessageSquareText size={13} /> {overdueInvoices.length || invoices.length} fatura(s) em aberto</span>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}><X size={18} /></button>
        </div>

        {/* STATS BAR */}
        <div className={styles.statsBar}>
          <div className={styles.statItem}>
            <Send size={14} />
            <span>{dispatchCount} cobranças enviadas</span>
          </div>
          <div className={styles.statItem}>
            <HandshakeIcon size={14} />
            <span>{promises.length} promessa(s)</span>
          </div>
          <div className={styles.statItem}>
            <ClipboardList size={14} />
            <span>{interactions.length} atendimento(s)</span>
          </div>
          {lastDispatch && (
            <div className={styles.statItem}>
              <CalendarClock size={14} />
              <span>Último disparo: {new Date(lastDispatch).toLocaleDateString("pt-BR")}</span>
            </div>
          )}
        </div>

        {/* TABS */}
        <div className={styles.tabs}>
          {(["invoices", "promises", "interactions"] as Tab[]).map((tab) => (
            <button
              key={tab}
              className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === "invoices" && "Faturas"}
              {tab === "promises" && "Promessas"}
              {tab === "interactions" && "Atendimentos"}
            </button>
          ))}
        </div>

        {/* CONTENT */}
        <div className={styles.content}>
          {loading && (
            <div className={styles.loadingState}>
              <Loader2 size={20} className={styles.spinner} />
              <span>Carregando...</span>
            </div>
          )}

          {/* INVOICES TAB */}
          {!loading && activeTab === "invoices" && (
            <div className={styles.tableWrap}>
              {invoices.length === 0 ? (
                <p className={styles.empty}>Nenhuma fatura carregada.</p>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Contrato</th>
                      <th>Vencimento</th>
                      <th>Valor</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.invoice_id}>
                        <td>{inv.contract_id}</td>
                        <td>{inv.invoice_due_date}</td>
                        <td>R$ {Number(inv.invoice_amount).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td>
                          <span className={`${styles.badge} ${styles[`badge_${inv.invoice_status?.replace(/\s/g, "_").toLowerCase()}`] ?? ""}`}>
                            {inv.invoice_status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* PROMISES TAB */}
          {!loading && activeTab === "promises" && (
            <div className={styles.tabSection}>
              <div className={styles.tabSectionHeader}>
                <span>Promessas de pagamento</span>
                <button className={styles.addBtn} onClick={() => setShowNewPromise((v) => !v)}>
                  <Plus size={14} /> Nova promessa
                </button>
              </div>

              {showNewPromise && (
                <div className={styles.formCard}>
                  <div className={styles.formRow}>
                    <label>Data prometida</label>
                    <input
                      type="date"
                      className={styles.input}
                      value={promiseDate}
                      onChange={(e) => setPromiseDate(e.target.value)}
                    />
                  </div>
                  <div className={styles.formRow}>
                    <label>Valor prometido (opcional)</label>
                    <input
                      type="number"
                      className={styles.input}
                      placeholder="R$ 0,00"
                      value={promiseAmount}
                      onChange={(e) => setPromiseAmount(e.target.value)}
                    />
                  </div>
                  <div className={styles.formActions}>
                    <button className={styles.btnSave} onClick={() => void handleSavePromise()} disabled={savingPromise}>
                      {savingPromise ? "Salvando..." : "Salvar"}
                    </button>
                    <button className={styles.btnCancel} onClick={() => setShowNewPromise(false)}>Cancelar</button>
                  </div>
                </div>
              )}

              {promises.length === 0 ? (
                <p className={styles.empty}>Nenhuma promessa registrada.</p>
              ) : (
                <div className={styles.list}>
                  {promises.map((p) => (
                    <div key={p.id} className={styles.listItem}>
                      <div className={styles.listItemMain}>
                        <span className={styles.listItemDate}>
                          <CalendarClock size={13} /> {new Date(p.promised_payment_date).toLocaleDateString("pt-BR")}
                        </span>
                        <span>R$ {Number(p.promised_amount ?? p.total_debt).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <span className={`${styles.promiseBadge} ${styles[`promise_${p.status}`]}`}>
                          {PROMISE_STATUS_LABEL[p.status] ?? p.status}
                        </span>
                      </div>
                      {p.status === "pending" && (
                        <div className={styles.promiseActions}>
                          <span className={styles.promiseActionsLabel}>Atualizar promessa:</span>
                          <button onClick={() => void handleUpdatePromiseStatus(p.id, "kept")} className={styles.btnKept}>Marcar como cumprida</button>
                          <button onClick={() => void handleUpdatePromiseStatus(p.id, "broken")} className={styles.btnBroken}>Marcar como quebrada</button>
                        </div>
                      )}
                      {p.service_report && (
                        <p className={styles.serviceReport}>{p.service_report}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* INTERACTIONS TAB */}
          {!loading && activeTab === "interactions" && (
            <div className={styles.tabSection}>
              <div className={styles.tabSectionHeader}>
                <span>Histórico de atendimentos</span>
                <button className={styles.addBtn} onClick={() => setShowNewInteraction((v) => !v)}>
                  <Plus size={14} /> Novo atendimento
                </button>
              </div>

              {showNewInteraction && (
                <div className={styles.formCard}>
                  <div className={styles.formRow}>
                    <label>Canal</label>
                    <select
                      className={styles.input}
                      value={interactionType}
                      onChange={(e) => setInteractionType(e.target.value as InteractionType)}
                    >
                      {(["call", "whatsapp", "email", "visit", "other"] as InteractionType[]).map((t) => (
                        <option key={t} value={t}>{INTERACTION_TYPE_LABEL[t]}</option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.formRow}>
                    <label>Resultado</label>
                    <select
                      className={styles.input}
                      value={interactionOutcome}
                      onChange={(e) => setInteractionOutcome(e.target.value as InteractionOutcome)}
                    >
                      {(["payment_promise", "no_contact", "agreement", "refused", "other"] as InteractionOutcome[]).map((o) => (
                        <option key={o} value={o}>{INTERACTION_OUTCOME_LABEL[o]}</option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.formRow}>
                    <label>Descrição</label>
                    <textarea
                      className={`${styles.input} ${styles.textarea}`}
                      rows={3}
                      placeholder="Descreva o atendimento..."
                      value={interactionDesc}
                      onChange={(e) => setInteractionDesc(e.target.value)}
                    />
                  </div>
                  <div className={styles.formActions}>
                    <button className={styles.btnSave} onClick={() => void handleSaveInteraction()} disabled={savingInteraction}>
                      {savingInteraction ? "Salvando..." : "Salvar"}
                    </button>
                    <button className={styles.btnCancel} onClick={() => setShowNewInteraction(false)}>Cancelar</button>
                  </div>
                </div>
              )}

              {interactions.length === 0 ? (
                <p className={styles.empty}>Nenhum atendimento registrado.</p>
              ) : (
                <div className={styles.list}>
                  {interactions.map((i) => (
                    <div key={i.id} className={styles.listItem}>
                      <div className={styles.listItemMain}>
                        <span className={styles.interactionType}>
                          {INTERACTION_TYPE_LABEL[i.type ?? ""] ?? i.type}
                        </span>
                        <span className={styles.interactionOutcome}>
                          {INTERACTION_OUTCOME_LABEL[i.outcome ?? ""] ?? i.outcome}
                        </span>
                        <span className={styles.listItemDate}>
                          <CalendarClock size={12} /> {new Date(i.created_at).toLocaleDateString("pt-BR")}
                        </span>
                      </div>
                      {i.description && <p className={styles.interactionDesc}>{i.description}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
