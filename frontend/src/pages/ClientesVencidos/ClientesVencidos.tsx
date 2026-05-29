import { useEffect, useMemo, useRef, useState } from "react";
import {
  Users,
  CircleDollarSign,
  SearchX,
  HandshakeIcon,
  Send,
  Search,
  Clock,
  Loader2,
  RefreshCcw,
  Radio,
  Settings2,
} from "lucide-react";
import { toast } from "react-toastify";
import { useLocation, useNavigate } from "react-router-dom";

import { ClientesCard } from "../../componente/ClientesCard/ClientesCard";
import {
  InputFields,
  Dropdown,
  MyButton,
  PageContainer,
  TitlePage,
} from "../../componente/Index";
import { Pagination } from "../../componente/global/Pagination/Pagination";
import ModalCardCampanhas from "../../componente/ModalCardCampanhas/ModalCardCampanhas";
import DynamicModal from "../../componente/modal/modalAlertTemplate";
import { useDispatchTemplate } from "../../hooks/useDispatchTemplate";
import { useDebounce } from "../../hooks/useDebounce";
import { useAccountParam } from "../../hooks/useAccountParam";

import {
  calcularDividaCliente,
  faturasVencidas,
  maiorAtrasoCliente,
} from "../../utils/filtrosClientesVencidos";
import type {
  CampaignData,
  Cliente,
  InvoiceSyncState,
  OverdueClientsSearchResponse,
  PaymentPromise,
  Template,
} from "../../types";
import { CollectionService } from "../../services/collection/collection.service";
import { CampaignService } from "../../services/campaign/campaign.service";
import { ClientService } from "../../services/client/client.service";
import { AuthService } from "../../services/auth/auth.service";
import type { PromiseAutomationSettings } from "../../services/auth/auth.service";
import { TemplateService } from "../../services/template/template.service";
import { createInvoicesSocket } from "../../services/realtime/invoicesRealtime";
import { getErrorMessage } from "../../utils/error";
import { buildNormalizedSearch } from "../../utils/locationSearch";

import Style from "./Styles/ClientesVencidos.module.css";

type AgingFilter = "1-30" | "31-60" | "61-90" | "90+" | "180+" | "360+" | "720+" | null;
type DebtFilter = "up200" | "200-500" | "500-1k" | "1k+" | null;
type PromiseFilter = "none" | "pending" | "broken" | null;
type DispatchFilter = "never" | "1-3" | "4+" | null;

const AGING_OPTIONS: { id: AgingFilter; label: string }[] = [
  { id: "1-30", label: "1 – 30 dias" },
  { id: "31-60", label: "31 – 60 dias" },
  { id: "61-90", label: "61 – 90 dias" },
  { id: "90+", label: "+ 90 dias" },
  { id: "180+", label: "+ 180 dias" },
  { id: "360+", label: "+ 360 dias" },
  { id: "720+", label: "+ 720 dias" },
];

const DEBT_OPTIONS: { id: DebtFilter; label: string }[] = [
  { id: "up200", label: "Até R$ 200" },
  { id: "200-500", label: "R$ 200 – 500" },
  { id: "500-1k", label: "R$ 500 – 1k" },
  { id: "1k+", label: "R$ 1k+" },
];

const PROMISE_OPTIONS: { id: PromiseFilter; label: string; variant?: string }[] = [
  { id: "none", label: "Sem promessa" },
  { id: "pending", label: "Pendente", variant: "chipWarning" },
  { id: "broken", label: "Quebrada", variant: "chipDanger" },
];

const DISPATCH_OPTIONS: { id: DispatchFilter; label: string }[] = [
  { id: "never", label: "Nunca cobrado" },
  { id: "1-3", label: "1 – 3x" },
  { id: "4+", label: "4x ou mais" },
];

const PAGE_SIZE = 8;
const BULK_FETCH_PAGE_SIZE = 100;
const COLLECTION_ENRICH_BATCH_SIZE = 20;
const SYNC_STATE_POLL_INTERVAL_MS = 15_000;
const DEFAULT_PROMISE_AUTOMATION: PromiseAutomationSettings = {
  reminderEnabled: false,
  reminderTiming: "day_before",
  autoBreakEnabled: false,
  checkPaymentBeforeBreak: true,
  reminderTemplateId: null,
  reminderTemplateName: null,
};

type OverdueSnapshotSummary = OverdueClientsSearchResponse["summary"];

function agingMatch(dias: number, filter: AgingFilter): boolean {
  if (!filter) return true;
  if (filter === "1-30") return dias >= 1 && dias <= 30;
  if (filter === "31-60") return dias >= 31 && dias <= 60;
  if (filter === "61-90") return dias >= 61 && dias <= 90;
  if (filter === "90+") return dias > 90;
  if (filter === "180+") return dias > 180;
  if (filter === "360+") return dias > 360;
  if (filter === "720+") return dias > 720;
  return true;
}

function debtMatch(debt: number, filter: DebtFilter): boolean {
  if (!filter) return true;
  if (filter === "up200") return debt <= 200;
  if (filter === "200-500") return debt > 200 && debt <= 500;
  if (filter === "500-1k") return debt > 500 && debt <= 1000;
  if (filter === "1k+") return debt > 1000;
  return true;
}

function agingToServerParams(filter: AgingFilter): { agingMin?: number; agingMax?: number } {
  if (!filter) return {};
  if (filter === "1-30") return { agingMin: 1, agingMax: 30 };
  if (filter === "31-60") return { agingMin: 31, agingMax: 60 };
  if (filter === "61-90") return { agingMin: 61, agingMax: 90 };
  if (filter === "90+") return { agingMin: 91 };
  if (filter === "180+") return { agingMin: 181 };
  if (filter === "360+") return { agingMin: 361 };
  if (filter === "720+") return { agingMin: 721 };
  return {};
}

function debtToServerParams(filter: DebtFilter): { debtMin?: number; debtMax?: number } {
  if (!filter) return {};
  if (filter === "up200") return { debtMax: 200 };
  if (filter === "200-500") return { debtMin: 200, debtMax: 500 };
  if (filter === "500-1k") return { debtMin: 500, debtMax: 1000 };
  if (filter === "1k+") return { debtMin: 1000 };
  return {};
}

function dispatchMatch(count: number, filter: DispatchFilter): boolean {
  if (!filter) return true;
  if (filter === "never") return count === 0;
  if (filter === "1-3") return count >= 1 && count <= 3;
  if (filter === "4+") return count >= 4;
  return true;
}

function formatSyncTime(value?: string | null) {
  if (!value) return "Nunca sincronizado";
  return new Date(value).toLocaleString("pt-BR");
}

function getCompletedSyncToken(state?: InvoiceSyncState | null) {
  if (!state) return null;

  if (state.status === "success") {
    return state.lastSuccessAt ? `success:${state.lastSuccessAt}` : null;
  }

  if (state.status === "error") {
    return state.lastFinishedAt
      ? `error:${state.lastFinishedAt}`
      : state.updatedAt
        ? `error:${state.updatedAt}`
        : null;
  }

  return null;
}

function getClientDebtAndDelay(client: Cliente) {
  const invoices = client.invoices?.list ?? [];
  const overdue = invoices.filter(faturasVencidas);
  const baseInvoices = overdue.length ? overdue : invoices;

  return {
    debt: calcularDividaCliente(baseInvoices),
    diasVencidos: overdue.length ? maiorAtrasoCliente(overdue) : 0,
  };
}

function matchesSnapshotFilters(client: Cliente, agingFilter: AgingFilter, debtFilter: DebtFilter) {
  const { debt, diasVencidos } = getClientDebtAndDelay(client);

  if (agingFilter && !agingMatch(diasVencidos, agingFilter)) return false;
  if (debtFilter && !debtMatch(debt, debtFilter)) return false;

  return true;
}

function hasPromiseRecord(promise: PaymentPromise | null | undefined): promise is PaymentPromise {
  return !!promise && typeof promise.id === "string" && promise.id.trim().length > 0;
}

function getPromiseTimestamp(promise: PaymentPromise) {
  return new Date(promise.created_at ?? promise.updated_at ?? 0).getTime();
}

function hasPromiseStatus(
  statuses: Set<PaymentPromise["status"]> | undefined,
  status: PaymentPromise["status"],
) {
  return !!statuses?.has(status);
}

export function ClientesVencidos() {
  const navigate = useNavigate();
  const location = useLocation();
  const account = useAccountParam();
  const normalizedSearch = buildNormalizedSearch(location.search);

  const [searchText, setSearchText] = useState("");
  const [agingFilter, setAgingFilter] = useState<AgingFilter>(null);
  const [debtFilter, setDebtFilter] = useState<DebtFilter>(null);
  const [promiseFilter, setPromiseFilter] = useState<PromiseFilter>(null);
  const [dispatchFilter, setDispatchFilter] = useState<DispatchFilter>(null);

  const [clientesMarcados, setClientesMarcados] = useState<string[]>([]);
  const [clientesComFaturas, setClientesComFaturas] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);
  const [promisesMap, setPromisesMap] = useState<Map<string, PaymentPromise | null>>(new Map());
  const [dispatchCountMap, setDispatchCountMap] = useState<Map<string, number>>(new Map());
  const [campaignsMap, setCampaignsMap] = useState<Map<string, CampaignData[]>>(new Map());
  const [currentPage, setCurrentPage] = useState(1);
  const [totalClients, setTotalClients] = useState(0);
  const [snapshotSummary, setSnapshotSummary] = useState<OverdueSnapshotSummary | null>(null);
  const [syncState, setSyncState] = useState<InvoiceSyncState | null>(null);
  const completedSyncTokenRef = useRef<string | null>(null);
  const latestLoadRequestRef = useRef(0);

  const [openProsseguirModal, setOpenProsseguirModal] = useState(false);
  const [openCampanhaModal, setOpenCampanhaModal] = useState(false);
  const [openAutomationModal, setOpenAutomationModal] = useState(false);
  const [promiseAutomation, setPromiseAutomation] = useState<PromiseAutomationSettings>(
    DEFAULT_PROMISE_AUTOMATION,
  );
  const [savingAutomation, setSavingAutomation] = useState(false);
  const [reminderTemplates, setReminderTemplates] = useState<Template[]>([]);
  const [loadingReminderTemplates, setLoadingReminderTemplates] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");
  const [openAutomationTemplateDropdown, setOpenAutomationTemplateDropdown] = useState(false);

  const debouncedSearch = useDebounce(searchText, 350);

  const { selectedClientes, setSelectedClientes, setSelectedTemplate, setModoPage } = useDispatchTemplate();

  const totalPages = Math.max(1, Math.ceil(totalClients / PAGE_SIZE));
  const companyId = syncState?.companyId ?? clientesComFaturas[0]?.company?.id ?? "";
  // promise/dispatch filters require client-side enrichment; aging/debt are now server-side
  const hasClientSideFilters = !!(promiseFilter || dispatchFilter);
  const hasStructuredFilters = !!(agingFilter || debtFilter || promiseFilter || dispatchFilter);

  // Holds latest filter state for use inside callbacks without stale closures
  const latestFiltersRef = useRef({
    account,
    debouncedSearch,
    currentPage,
    agingFilter,
    debtFilter,
    promiseFilter,
    dispatchFilter,
    hasClientSideFilters,
  });
  useEffect(() => {
    latestFiltersRef.current = {
      account,
      debouncedSearch,
      currentPage,
      agingFilter,
      debtFilter,
      promiseFilter,
      dispatchFilter,
      hasClientSideFilters,
    };
  });

  useEffect(() => {
    let cancelled = false;
    const requestId = ++latestLoadRequestRef.current;

    async function loadPage() {
      if (!account) return;

      setLoading(true);
      try {
        const [result, syncResponse] = await Promise.all([
          hasClientSideFilters
            ? loadFilteredClients({
                account,
                query: debouncedSearch,
                page: currentPage,
                agingFilter,
                debtFilter,
                promiseFilter,
                dispatchFilter,
              })
            : loadServerPage({
                account,
                query: debouncedSearch,
                page: currentPage,
                agingFilter,
                debtFilter,
              }),
          ClientService.getInvoiceSyncState(account).catch(() => null),
        ]);

        if (cancelled || latestLoadRequestRef.current !== requestId) return;

        if ("resolvedPage" in result && result.resolvedPage !== currentPage) {
          setCurrentPage(result.resolvedPage);
        }

        setClientesComFaturas(result.clients);
        setTotalClients(result.total);
        setSnapshotSummary(result.summary ?? null);
        setClientesMarcados([]);
        setSelectedClientes([]);
        setPromisesMap(result.promisesMap);
        setDispatchCountMap(result.dispatchCountMap);

        const campaignsData = await fetchCampaignsForClients(result.clients);
        if (!cancelled && latestLoadRequestRef.current === requestId) {
          setCampaignsMap(campaignsData);
        }

        if (syncResponse?.data) {
          setSyncState(syncResponse.data);
          completedSyncTokenRef.current = getCompletedSyncToken(syncResponse.data);
        }
      } catch (error) {
        if (!cancelled && latestLoadRequestRef.current === requestId) {
          toast.error(getErrorMessage(error, "Erro ao carregar clientes vencidos."));
        }
      } finally {
        if (!cancelled && latestLoadRequestRef.current === requestId) {
          setLoading(false);
        }
      }
    }

    void loadPage();

    return () => {
      cancelled = true;
    };
  }, [
    account,
    currentPage,
    debouncedSearch,
    agingFilter,
    debtFilter,
    promiseFilter,
    dispatchFilter,
    hasStructuredFilters,
    setSelectedClientes,
  ]);

  useEffect(() => {
    if (!account) return;

    const socket = createInvoicesSocket(account);

    socket.on("connect", () => {
      socket.emit("invoices:subscribe", { account });
    });

    socket.on("invoices:sync", (payload: InvoiceSyncState & { account?: string }) => {
      if (payload.account && payload.account !== account) return;

      const nextState: InvoiceSyncState = {
        companyId: payload.companyId ?? "",
        companyName: payload.companyName ?? "",
        account,
        status: payload.status ?? "idle",
        message: payload.message ?? null,
        invoicesSynced: payload.invoicesSynced ?? 0,
        lastStartedAt: payload.lastStartedAt ?? null,
        lastFinishedAt: payload.lastFinishedAt ?? null,
        lastSuccessAt: payload.lastSuccessAt ?? null,
        durationMs: payload.durationMs ?? null,
        updatedAt: payload.updatedAt ?? null,
      };

      setSyncState((prev) => ({
        ...nextState,
        companyId: nextState.companyId || (prev?.companyId ?? ""),
        companyName: nextState.companyName || (prev?.companyName ?? ""),
        invoicesSynced: nextState.invoicesSynced ?? prev?.invoicesSynced ?? 0,
      }));

      const nextCompletedToken = getCompletedSyncToken(nextState);
      if (nextCompletedToken && nextCompletedToken !== completedSyncTokenRef.current) {
        completedSyncTokenRef.current = nextCompletedToken;
        void refreshPage(false);
      }
    });

    return () => {
      socket.off("invoices:sync");
      socket.disconnect();
    };
  }, [account]);

  useEffect(() => {
    if (!account) return;

    let cancelled = false;

    const pollSyncState = async () => {
      try {
        const response = await ClientService.getInvoiceSyncState(account);
        if (cancelled || !response.data) return;

        const nextState = response.data;
        setSyncState(nextState);

        const nextCompletedToken = getCompletedSyncToken(nextState);
        if (nextCompletedToken && nextCompletedToken !== completedSyncTokenRef.current) {
          completedSyncTokenRef.current = nextCompletedToken;
          await refreshPage(false);
        }
      } catch {
        // Mantém a UI funcional mesmo sem resposta transitória do status.
      }
    };

    const intervalId = window.setInterval(() => {
      void pollSyncState();
    }, SYNC_STATE_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [account]);

  useEffect(() => {
    let cancelled = false;

    async function loadPromiseAutomation() {
      try {
        const result = await AuthService.getPromiseAutomation();
        if (!cancelled) {
          setPromiseAutomation(
            result.promiseAutomation ?? DEFAULT_PROMISE_AUTOMATION,
          );
        }
      } catch {
        if (!cancelled) {
          setPromiseAutomation(DEFAULT_PROMISE_AUTOMATION);
        }
      }
    }

    void loadPromiseAutomation();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!openAutomationModal || !account) return;

    let cancelled = false;

    async function loadTemplates() {
      try {
        setLoadingReminderTemplates(true);
        const result = await TemplateService.search({
          account: Number(account),
          query: templateSearch,
          page: 1,
          limit: 50,
          sortorder: "DESC",
        });

        if (cancelled) return;

        const approvedTemplates = (result.data ?? []).filter(
          (template) => template.active && String(template.meta_status).toUpperCase() === "APPROVED",
        );
        setReminderTemplates(approvedTemplates);
      } catch {
        if (!cancelled) {
          setReminderTemplates([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingReminderTemplates(false);
        }
      }
    }

    void loadTemplates();

    return () => {
      cancelled = true;
    };
  }, [openAutomationModal, account, templateSearch]);

  async function fetchAllOverdueClients(
    account: string,
    query: string,
    agingFilter?: AgingFilter,
    debtFilter?: DebtFilter,
  ) {
    const allClients: Cliente[] = [];
    let page = 1;
    let total = 0;
    let summary: OverdueSnapshotSummary | null = null;
    const agingParams = agingToServerParams(agingFilter ?? null);
    const debtParams = debtToServerParams(debtFilter ?? null);

    while (true) {
      const response = await ClientService.searchOverdueClients({
        account,
        query,
        page,
        limit: BULK_FETCH_PAGE_SIZE,
        ...agingParams,
        ...debtParams,
      });

      const payload = response.data;
      if (page === 1) {
        total = payload.total ?? 0;
        summary = payload.summary ?? null;
      }

      const batch = (payload.data as Cliente[]) ?? [];
      allClients.push(...batch);

      if (!batch.length || allClients.length >= total) break;
      page += 1;
    }

    return { clients: allClients, summary };
  }

  async function enrichClients(
    clients: Cliente[],
    options: { includePromise: boolean; includeDispatch: boolean },
  ) {
    const nextPromisesMap = new Map<string, PaymentPromise | null>();
    const nextDispatchCountMap = new Map<string, number>();

    if (!clients.length || (!options.includePromise && !options.includeDispatch)) {
      return { promisesMap: nextPromisesMap, dispatchCountMap: nextDispatchCountMap };
    }

    setEnriching(true);
    try {
      const clientIds = clients.map((c) => c.id);
      const phones = clients.map((c) => c.whatsapp).filter(Boolean) as string[];
      const batchCompanyId = clients.find((c) => c.company?.id)?.company?.id ?? "";

      const [latestPromises, dispatchBatch] = await Promise.all([
        options.includePromise
          ? CollectionService.getLatestPromiseBatch(clientIds)
          : Promise.resolve([]),
        options.includeDispatch && phones.length && batchCompanyId
          ? CollectionService.getDispatchSummaryBatch(phones, batchCompanyId)
          : Promise.resolve({}),
      ]);

      if (options.includePromise) {
        const promiseByClientId = new Map(latestPromises.map((p) => [p.client_id, p]));
        for (const client of clients) {
          nextPromisesMap.set(client.id, promiseByClientId.get(client.id) ?? null);
        }
      }

      if (options.includeDispatch) {
        for (const client of clients) {
          const normalizedPhone = (client.whatsapp ?? "").replace(/\D/g, "");
          nextDispatchCountMap.set(client.id, dispatchBatch[normalizedPhone]?.total ?? 0);
        }
      }

      return { promisesMap: nextPromisesMap, dispatchCountMap: nextDispatchCountMap };
    } finally {
      setEnriching(false);
    }
  }

  async function fetchCampaignsForClients(clients: Cliente[]): Promise<Map<string, CampaignData[]>> {
    if (!clients.length) return new Map();
    try {
      const clientIds = clients.map((c) => c.id);
      const record = await CampaignService.getByClientIds(clientIds);
      return new Map(Object.entries(record));
    } catch {
      return new Map();
    }
  }

  async function loadPromiseMetadataForClients(clients: Cliente[]) {
    const promisesMap = new Map<string, PaymentPromise | null>();
    const promiseStatusesMap = new Map<string, Set<PaymentPromise["status"]>>();
    if (!clients.length) return { promisesMap, promiseStatusesMap };

    const companyIds = [...new Set(clients.map((client) => client.company?.id).filter(Boolean))] as string[];

    if (!companyIds.length) {
      clients.forEach((client) => promisesMap.set(client.id, null));
      return { promisesMap, promiseStatusesMap };
    }

    const companyPromises = await Promise.all(
      companyIds.map((companyId) => CollectionService.getPromisesByCompany(companyId).catch(() => [])),
    );

    const latestByClient = new Map<string, PaymentPromise>();

    companyPromises.flat().forEach((promise) => {
      if (!hasPromiseRecord(promise)) return;

      const clientStatuses = promiseStatusesMap.get(promise.client_id) ?? new Set<PaymentPromise["status"]>();
      clientStatuses.add(promise.status);
      promiseStatusesMap.set(promise.client_id, clientStatuses);

      const current = latestByClient.get(promise.client_id);
      if (!current || getPromiseTimestamp(promise) > getPromiseTimestamp(current)) {
        latestByClient.set(promise.client_id, promise);
      }
    });

    clients.forEach((client) => {
      promisesMap.set(client.id, latestByClient.get(client.id) ?? null);
    });

    return { promisesMap, promiseStatusesMap };
  }

  async function loadServerPage(params: {
    account: string;
    query: string;
    page: number;
    agingFilter?: AgingFilter;
    debtFilter?: DebtFilter;
  }) {
    const response = await ClientService.searchOverdueClients({
      account: params.account,
      query: params.query,
      page: params.page,
      limit: PAGE_SIZE,
      ...agingToServerParams(params.agingFilter ?? null),
      ...debtToServerParams(params.debtFilter ?? null),
    });

    const clients = (response.data.data as Cliente[]) ?? [];
    const enriched = await enrichClients(clients, {
      includePromise: true,
      includeDispatch: true,
    });

    return {
      clients,
      total: response.data.total ?? 0,
      summary: response.data.summary ?? null,
      promisesMap: enriched.promisesMap,
      dispatchCountMap: enriched.dispatchCountMap,
    };
  }

  // Used only when promiseFilter or dispatchFilter is active (requires client-side enrichment).
  // aging/debt are passed as server-side params to reduce the dataset before enrichment.
  async function resolveFilteredClients(params: {
    account: string;
    query: string;
    agingFilter: AgingFilter;
    debtFilter: DebtFilter;
    promiseFilter: PromiseFilter;
    dispatchFilter: DispatchFilter;
  }) {
    const { clients: allClients, summary } = await fetchAllOverdueClients(
      params.account,
      params.query,
      params.agingFilter,
      params.debtFilter,
    );

    let filteredClients = allClients;
    let collectionPromisesMap = new Map<string, PaymentPromise | null>();
    let collectionPromiseStatusesMap = new Map<string, Set<PaymentPromise["status"]>>();
    let collectionDispatchCountMap = new Map<string, number>();

    if (params.promiseFilter) {
      setEnriching(true);
      try {
        const promiseMetadata = await loadPromiseMetadataForClients(allClients);
        collectionPromisesMap = promiseMetadata.promisesMap;
        collectionPromiseStatusesMap = promiseMetadata.promiseStatusesMap;
      } finally {
        setEnriching(false);
      }
    }

    if (params.dispatchFilter) {
      const enriched = await enrichClients(allClients, {
        includePromise: false,
        includeDispatch: true,
      });
      collectionDispatchCountMap = enriched.dispatchCountMap;
    }

    filteredClients = allClients.filter((client) => {
      const promise = collectionPromisesMap.get(client.id);
      const promiseStatuses = collectionPromiseStatusesMap.get(client.id);
      const dispatches = collectionDispatchCountMap.get(client.id) ?? 0;

      if (params.promiseFilter) {
        if (params.promiseFilter === "none" && hasPromiseRecord(promise)) return false;
        if (params.promiseFilter === "pending" && !hasPromiseStatus(promiseStatuses, "pending")) return false;
        if (params.promiseFilter === "broken" && !hasPromiseStatus(promiseStatuses, "broken")) return false;
      }

      if (params.dispatchFilter && !dispatchMatch(dispatches, params.dispatchFilter)) return false;

      return true;
    });

    return {
      clients: filteredClients,
      summary,
      promisesMap: collectionPromisesMap,
      dispatchCountMap: collectionDispatchCountMap,
    };
  }

  async function loadFilteredClients(params: {
    account: string;
    query: string;
    page: number;
    agingFilter: AgingFilter;
    debtFilter: DebtFilter;
    promiseFilter: PromiseFilter;
    dispatchFilter: DispatchFilter;
  }) {
    const resolved = await resolveFilteredClients(params);
    const total = resolved.clients.length;
    const resolvedPage = Math.min(params.page, Math.max(1, Math.ceil(total / PAGE_SIZE)));
    const start = (resolvedPage - 1) * PAGE_SIZE;
    const clients = resolved.clients.slice(start, start + PAGE_SIZE);

    const pageEnriched = {
      promisesMap: new Map(clients.map((client) => [client.id, resolved.promisesMap.get(client.id) ?? null])),
      dispatchCountMap: new Map(clients.map((client) => [client.id, resolved.dispatchCountMap.get(client.id) ?? 0])),
    };

    // If neither promise nor dispatch filter was active, we need to enrich the page now
    if (!params.promiseFilter && !params.dispatchFilter) {
      const enriched = await enrichClients(clients, { includePromise: true, includeDispatch: true });
      return {
        clients,
        total,
        summary: resolved.summary,
        resolvedPage,
        promisesMap: enriched.promisesMap,
        dispatchCountMap: enriched.dispatchCountMap,
      };
    }

    return {
      clients,
      total,
      summary: resolved.summary,
      resolvedPage,
      promisesMap: pageEnriched.promisesMap,
      dispatchCountMap: pageEnriched.dispatchCountMap,
    };
  }

  async function refreshPage(showToast = true) {
    const f = latestFiltersRef.current;
    if (!f.account) return;

    const requestId = ++latestLoadRequestRef.current;

    try {
      const result = f.hasClientSideFilters
        ? await loadFilteredClients({
            account: f.account,
            query: f.debouncedSearch,
            page: f.currentPage,
            agingFilter: f.agingFilter,
            debtFilter: f.debtFilter,
            promiseFilter: f.promiseFilter,
            dispatchFilter: f.dispatchFilter,
          })
        : await loadServerPage({
            account: f.account,
            query: f.debouncedSearch,
            page: f.currentPage,
            agingFilter: f.agingFilter,
            debtFilter: f.debtFilter,
          });

      if (latestLoadRequestRef.current !== requestId) return;

      if ("resolvedPage" in result && result.resolvedPage !== f.currentPage) {
        setCurrentPage(result.resolvedPage);
      }

      setClientesComFaturas(result.clients);
      setTotalClients(result.total);
      setSnapshotSummary(result.summary ?? null);
      setClientesMarcados([]);
      setSelectedClientes([]);
      setPromisesMap(result.promisesMap);
      setDispatchCountMap(result.dispatchCountMap);

      const campaignsData = await fetchCampaignsForClients(result.clients);
      if (latestLoadRequestRef.current === requestId) {
        setCampaignsMap(campaignsData);
      }

      if (showToast) {
        toast.success("Lista de clientes vencidos atualizada.");
      }
    } catch (error) {
      if (latestLoadRequestRef.current === requestId) {
        toast.error(getErrorMessage(error, "Erro ao atualizar clientes vencidos."));
      }
    }
  }

  async function handleRefresh() {
    let resolvedCompanyId = companyId;

    if (!resolvedCompanyId && account) {
      try {
        const response = await ClientService.getInvoiceSyncState(account);
        if (response.data) {
          setSyncState(response.data);
          resolvedCompanyId = response.data.companyId;
        }
      } catch {
        // mantém o fluxo de erro amigável abaixo
      }
    }

    if (!resolvedCompanyId) {
      toast.warning("Nenhuma empresa encontrada para sincronizar.");
      return;
    }

    try {
      await ClientService.syncInvoices(resolvedCompanyId);
      setSyncState((prev) => ({
        companyId: resolvedCompanyId,
        companyName: prev?.companyName ?? "",
        account,
        status: "running",
        message: "Sincronização em andamento com o ERP.",
        invoicesSynced: prev?.invoicesSynced ?? 0,
        lastStartedAt: new Date().toISOString(),
        lastFinishedAt: prev?.lastFinishedAt ?? null,
        lastSuccessAt: prev?.lastSuccessAt ?? null,
        durationMs: null,
        updatedAt: new Date().toISOString(),
      }));
      toast.info("Sincronização iniciada. A página será atualizada ao concluir.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao iniciar sincronização com o ERP."));
    }
  }

  function resetFilters() {
    setCurrentPage(1);
    setSearchText("");
    setAgingFilter(null);
    setDebtFilter(null);
    setPromiseFilter(null);
    setDispatchFilter(null);
  }

  const pageDebt = useMemo(
    () =>
      clientesComFaturas.reduce((acc, client) => {
        const { debt } = getClientDebtAndDelay(client);
        return acc + debt;
      }, 0),
    [clientesComFaturas],
  );

  const totalDivida = hasStructuredFilters ? pageDebt : (snapshotSummary?.totalDebt ?? pageDebt);
  const totalClientesVencidos = hasStructuredFilters
    ? totalClients
    : (snapshotSummary?.totalOverdueClients ?? totalClients);
  const checkedClients = snapshotSummary?.checkedClients ?? snapshotSummary?.clientsWithSnapshot ?? 0;
  const snapshotSummaryView = snapshotSummary
    ? {
        checkedLabel:
          checkedClients >= snapshotSummary.mappedClients
            ? `Todos os ${snapshotSummary.mappedClients} clientes`
            : `${checkedClients} de ${snapshotSummary.mappedClients} clientes`,
        syncedLabel: `${snapshotSummary.clientsWithSnapshot} com faturas`,
        overdueLabel: `${snapshotSummary.totalOverdueClients} em atraso`,
      }
    : null;

  function toggleCliente(cliente: Cliente) {
    setClientesMarcados((prev) =>
      prev.includes(cliente.id)
        ? prev.filter((id) => id !== cliente.id)
        : [...prev, cliente.id],
    );

    setSelectedClientes((prev) =>
      prev.some((current) => current.id === cliente.id)
        ? prev.filter((current) => current.id !== cliente.id)
        : [...prev, cliente],
    );
  }

  async function marcarTodos() {
    if (!account || selectingAll) return;

    setSelectingAll(true);
    try {
      const targetClients = hasStructuredFilters
        ? (await resolveFilteredClients({
            account,
            query: debouncedSearch,
            agingFilter,
            debtFilter,
            promiseFilter,
            dispatchFilter,
          })).clients
        : (await fetchAllOverdueClients(account, debouncedSearch)).clients;

      if (!targetClients.length) {
        toast.warning("Nenhum cliente para selecionar");
        return;
      }

      const targetIds = new Set(targetClients.map((client) => client.id));
      const allFilteredSelected = targetClients.every((client) =>
        selectedClientes.some((selected) => selected.id === client.id),
      );

      if (allFilteredSelected) {
        setClientesMarcados((prev) => prev.filter((id) => !targetIds.has(id)));
        setSelectedClientes((prev) => prev.filter((client) => !targetIds.has(client.id)));
        toast.info(`Seleção removida dos ${targetClients.length} cliente(s) filtrados.`);
        return;
      }

      setClientesMarcados((prev) => {
        const next = new Set(prev);
        targetClients.forEach((client) => next.add(client.id));
        return [...next];
      });

      setSelectedClientes((prev) => {
        const next = new Map(prev.map((client) => [client.id, client]));
        targetClients.forEach((client) => next.set(client.id, client));
        return [...next.values()];
      });

      toast.success(`${targetClients.length} cliente(s) filtrados selecionados.`);
    } finally {
      setSelectingAll(false);
    }
  }

  function handleProsseguir() {
    if (!clientesMarcados.length) {
      toast.warning("Selecione ao menos um cliente.");
      return;
    }
    setOpenProsseguirModal(true);
  }

  function handleDispatchIndividual(cliente: Cliente) {
    setSelectedClientes([cliente]);
    setClientesMarcados([cliente.id]);
    setOpenProsseguirModal(true);
  }

  function toggleChip<T>(current: T, value: T, setter: (next: T | null) => void) {
    setCurrentPage(1);
    setter(current === value ? null : value);
  }

  const chipCls = (active: boolean, variant?: string) =>
    [Style.chip, active ? Style.chipActive : "", variant && active ? Style[variant] : ""]
      .filter(Boolean)
      .join(" ");

  const allVisibleSelected =
    totalClients > 0 &&
    clientesComFaturas.length > 0 &&
    clientesComFaturas.every((client) => clientesMarcados.includes(client.id)) &&
    selectedClientes.length >= totalClients;

  const hasActiveFilters = !!(searchText || agingFilter || debtFilter || promiseFilter || dispatchFilter);
  const syncStatusClass =
    syncState?.status === "success"
      ? Style.syncSuccess
      : syncState?.status === "error"
        ? Style.syncError
        : syncState?.status === "running"
        ? Style.syncRunning
          : Style.syncIdle;
  const selectedReminderTemplate =
    reminderTemplates.find(
      (template) => template.id === promiseAutomation.reminderTemplateId,
    ) ??
    (promiseAutomation.reminderTemplateId && promiseAutomation.reminderTemplateName
      ? ({
          id: promiseAutomation.reminderTemplateId,
          name: promiseAutomation.reminderTemplateName,
          message: "",
          category: "",
          active: true,
          company: {
            id: companyId,
            name: "",
            account: String(account ?? ""),
          },
          meta_status: "APPROVED",
          createdAt: new Date(),
          updatedAt: new Date(),
          variables: {},
          isEnabled: true,
        } as Template)
      : null);

  async function handleSavePromiseAutomation() {
    if (savingAutomation) return;

    if (promiseAutomation.reminderEnabled && !promiseAutomation.reminderTemplateId) {
      toast.warning("Selecione um template para o lembrete automático.");
      return;
    }

    try {
      setSavingAutomation(true);
      const result = await AuthService.updatePromiseAutomation(promiseAutomation);
      setPromiseAutomation(result.promiseAutomation);
      toast.success(result.message ?? "Automacao de promessas atualizada.");
      setOpenAutomationModal(false);
    } catch (error: unknown) {
      toast.error(
        getErrorMessage(error, "Nao foi possivel salvar a automacao de promessas."),
      );
    } finally {
      setSavingAutomation(false);
    }
  }

  return (
    <PageContainer className={Style.VencidosContainer}>
      <div className={Style.pageHeader}>
        <TitlePage
          title="Clientes Vencidos"
          subtitle="Acompanhe a base validada no ERP, identifique quem está em atraso e avance com a cobrança no momento certo."
        />

        <div className={Style.pageHeaderActions}>
            <div className={`${Style.syncCard} ${syncStatusClass}`}>
              <div className={Style.syncCardHeader}>
                <Radio size={14} />
                <span>Última atualização</span>
              </div>
              <div className={Style.syncCardBody}>
                <div className={Style.syncCardTimeBlock}>
                  <strong>{formatSyncTime(syncState?.lastSuccessAt ?? syncState?.updatedAt)}</strong>
                  <small>
                    {snapshotSummaryView
                      ? "Base pronta para consulta e seleção de clientes."
                      : (syncState?.message ?? "Aguardando a primeira sincronização do ERP.")}
                  </small>
                </div>

                {snapshotSummaryView && (
                  <div className={Style.syncCardStats}>
                    <small>
                      <span>Base conferida</span>
                      <strong>{snapshotSummaryView.checkedLabel}</strong>
                    </small>
                    <small>
                      <span>Cenário atual</span>
                      <strong>
                        {snapshotSummaryView.syncedLabel} • {snapshotSummaryView.overdueLabel}
                      </strong>
                    </small>
                  </div>
                )}
              </div>
            </div>

          <MyButton
            type="button"
            variant="secondary"
            text={syncState?.status === "running" ? "Sincronizando..." : "Atualizar ERP"}
            onClick={() => void handleRefresh()}
            disabled={syncState?.status === "running"}
          />
          <MyButton
            type="button"
            variant="secondary"
            text="Automação"
            onClick={() => setOpenAutomationModal(true)}
          />
          <MyButton
            type="button"
            variant="secondary"
            text={selectingAll ? "Processando..." : allVisibleSelected ? "Desmarcar todos" : "Selecionar todos"}
            onClick={() => void marcarTodos()}
            disabled={selectingAll}
          />
          <MyButton type="button" variant="btn-norm" text="Prosseguir" onClick={handleProsseguir} />
        </div>
      </div>

      <div className={Style.contentPanel}>
        {loading && (
          <div className={Style.loadingState}>
            <Loader2 size={22} className={Style.spinner} />
            <span>Carregando snapshot de clientes vencidos...</span>
          </div>
        )}

        {!loading && (
          <>
            <div className={Style.kpiStrip}>
              <div className={Style.kpiCard}>
                <Users size={16} className={Style.kpiIcon} />
                <div className={Style.kpiContent}>
                  <span className={Style.kpiLabel}>Clientes vencidos</span>
                  <span className={Style.kpiValue}>{totalClientesVencidos}</span>
                </div>
              </div>

              <div className={Style.kpiCard}>
                <CircleDollarSign size={16} className={Style.kpiIcon} />
                <div className={Style.kpiContent}>
                  <span className={Style.kpiLabel}>Dívida total</span>
                  <span className={Style.kpiValue}>
                    R$ {totalDivida.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div className={Style.kpiCard}>
                <RefreshCcw size={16} className={Style.kpiIcon} />
                <div className={Style.kpiContent}>
                  <span className={Style.kpiLabel}>Fonte dos dados</span>
                  <span className={Style.kpiValue}>
                    {syncState?.status === "running" ? "Sincronizando ERP" : "Base local sincronizada"}
                  </span>
                </div>
              </div>

              <div className={Style.kpiCard}>
                <Search size={16} className={Style.kpiIcon} />
                <div className={Style.kpiContent}>
                  <span className={Style.kpiLabel}>
                    {hasActiveFilters ? "Na página filtrada" : "Nesta página"}
                  </span>
                  <span className={Style.kpiValue}>{clientesComFaturas.length}</span>
                </div>
              </div>

              {clientesMarcados.length > 0 && (
                <div className={Style.kpiCard}>
                  <Users size={16} className={Style.kpiIcon} />
                  <div className={Style.kpiContent}>
                    <span className={Style.kpiLabel}>Selecionados</span>
                    <span className={Style.kpiValue}>{clientesMarcados.length}</span>
                  </div>
                </div>
              )}

              {hasActiveFilters && (
                <button className={Style.clearFiltersBtn} onClick={resetFilters}>
                  Limpar filtros
                </button>
              )}
            </div>

            <div className={Style.filterPanel}>
              <div className={Style.filterSearchRow}>
                <span className={Style.filterRowLabel}>
                  <Search size={11} /> Busca
                </span>
                <div className={Style.filterSearchInput}>
                  <InputFields
                    type="text"
                    label="Buscar por nome, CPF/CNPJ ou telefone"
                    value={searchText}
                    onChange={(event) => {
                      setCurrentPage(1);
                      setSearchText(event.target.value);
                    }}
                  />
                </div>
              </div>

              <div className={Style.filterRow}>
                <span className={Style.filterRowLabel}>
                  <Clock size={11} /> Atraso
                </span>
                <div className={Style.filterChips}>
                  {AGING_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      className={chipCls(agingFilter === option.id, "chipDanger")}
                      onClick={() => toggleChip(agingFilter, option.id, setAgingFilter)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={Style.filterRow}>
                <span className={Style.filterRowLabel}>
                  <CircleDollarSign size={11} /> Dívida
                </span>
                <div className={Style.filterChips}>
                  {DEBT_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      className={chipCls(debtFilter === option.id)}
                      onClick={() => toggleChip(debtFilter, option.id, setDebtFilter)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={Style.filterRow}>
                <span className={Style.filterRowLabel}>
                  <HandshakeIcon size={11} /> Promessa
                </span>
                <div className={Style.filterChips}>
                  {enriching
                    ? <span className={Style.enrichingHint}>carregando dados...</span>
                    : PROMISE_OPTIONS.map((option) => (
                        <button
                          key={option.id}
                          className={chipCls(promiseFilter === option.id, option.variant)}
                          onClick={() => toggleChip(promiseFilter, option.id, setPromiseFilter)}
                        >
                          {option.label}
                        </button>
                      ))}
                </div>
              </div>

              <div className={Style.filterRow}>
                <span className={Style.filterRowLabel}>
                  <Send size={11} /> Cobranças
                </span>
                <div className={Style.filterChips}>
                  {enriching
                    ? <span className={Style.enrichingHint}>carregando dados...</span>
                    : DISPATCH_OPTIONS.map((option) => (
                        <button
                          key={option.id}
                          className={chipCls(dispatchFilter === option.id, "chipSuccess")}
                          onClick={() => toggleChip(dispatchFilter, option.id, setDispatchFilter)}
                        >
                          {option.label}
                        </button>
                      ))}
                </div>
              </div>
            </div>
          </>
        )}

        {!loading && (
          <div className={Style.Cards}>
            {!clientesComFaturas.length ? (
              <div className={Style.empty}>
                <SearchX size={36} className={Style.emptyIcon} />
                <span>
                  {hasActiveFilters
                    ? "Nenhum cliente encontrado com a combinacao de filtros aplicada"
                    : "Nenhum cliente com faturas vencidas encontrado"}
                </span>
              </div>
            ) : (
              clientesComFaturas.map((cliente) => (
                <ClientesCard
                  key={cliente.id}
                  cliente={cliente}
                  checked={clientesMarcados.includes(cliente.id)}
                  onToggle={() => toggleCliente(cliente)}
                  companyId={cliente.company?.id ?? companyId}
                  latestPromise={hasPromiseRecord(promisesMap.get(cliente.id)) ? promisesMap.get(cliente.id) ?? null : null}
                  dispatchCount={dispatchCountMap.get(cliente.id) ?? 0}
                  onDispatch={() => handleDispatchIndividual(cliente)}
                  campaigns={campaignsMap.get(cliente.id) ?? []}
                />
              ))
            )}
          </div>
        )}

        <ModalCardCampanhas
          open={openCampanhaModal}
          onClose={() => setOpenCampanhaModal(false)}
          onConfirmCampaign={() => toast.success("Campanha disparada com sucesso (Implementar)!")}
        />

        {openProsseguirModal && (
          <DynamicModal
            open
            type="modaltemplates"
            title="Escolha uma opcao:"
            description={<>Você selecionou <b>{clientesMarcados.length}</b> cliente(s).</>}
            onClose={() => setOpenProsseguirModal(false)}
            buttons={[
              {
                label: "Fazer disparo manual",
                variant: "BtnOpcoes",
                onClick: () => {
                  setOpenProsseguirModal(false);
                  setModoPage("clientes");
                  navigate(`/${normalizedSearch}`);
                },
              },
              {
                label: "Selecionar uma campanha",
                variant: "BtnOpcoes",
                onClick: () => {
                  setOpenProsseguirModal(false);
                  setModoPage("clientes");
                  setOpenCampanhaModal(true);
                },
              },
              {
                label: "Criar campanha",
                variant: "BtnOpcoes",
                onClick: () => {
                  setOpenProsseguirModal(false);
                  setModoPage("clientes");
                  setSelectedTemplate(null);
                  navigate(`/createCampanha${normalizedSearch}`);
                },
              },
            ]}
          />
        )}

        {openAutomationModal && (
          <DynamicModal
            open
            type="custom"
            size="wide"
            title="Automação de promessas"
            containerClassName={Style.automationModalContainer}
            onClose={() => {
              if (!savingAutomation) {
                setOpenAutomationModal(false);
              }
            }}
            buttons={[
              {
                label: savingAutomation ? "Salvando..." : "Salvar configuração",
                onClick: () => void handleSavePromiseAutomation(),
                disabled: savingAutomation,
              },
            ]}
            customContent={
              <div className={Style.automationModalContent}>
                <p className={Style.automationModalDescription}>
                  Essas regras ficam disponíveis também no modo embed e valem
                  para a empresa autenticada.
                </p>

                <div className={Style.automationSettingsStack}>
                  <div className={Style.automationSettingRow}>
                    <div className={Style.automationCardText}>
                      <strong>Lembrete automático</strong>
                      <span>
                        Mantém a automação preparada para lembrar o cliente
                        antes do vencimento da promessa.
                      </span>
                    </div>
                    <button
                      type="button"
                      className={`${Style.automationToggle} ${promiseAutomation.reminderEnabled ? Style.automationToggleActive : ""}`}
                      onClick={() =>
                        setPromiseAutomation((prev) => ({
                          ...prev,
                          reminderEnabled: !prev.reminderEnabled,
                        }))
                      }
                    >
                      {promiseAutomation.reminderEnabled ? "Ligado" : "Desligado"}
                    </button>
                  </div>

                  {promiseAutomation.reminderEnabled && (
                    <div className={Style.automationFieldBlock}>
                      <span className={Style.automationFieldLabel}>
                        Template do lembrete automático
                      </span>
                      <Dropdown<Template>
                        label="Selecionar template do lembrete"
                        showFloatingLabel={false}
                        options={reminderTemplates}
                        value={selectedReminderTemplate}
                        onChange={(value) => {
                          const template = value as Template | null;
                          setPromiseAutomation((prev) => ({
                            ...prev,
                            reminderTemplateId: template?.id ?? null,
                            reminderTemplateName: template?.name ?? null,
                          }));
                        }}
                        open={openAutomationTemplateDropdown}
                        onOpen={() => setOpenAutomationTemplateDropdown(true)}
                        onClose={() => setOpenAutomationTemplateDropdown(false)}
                        className={Style.automationTemplateDropdown}
                        searchValue={templateSearch}
                        searchPlaceholder="Buscar template aprovado"
                        onSearchTermChange={setTemplateSearch}
                        placeholder={
                          loadingReminderTemplates
                            ? "Carregando templates..."
                            : "Selecione o template do lembrete"
                        }
                      />
                    </div>
                  )}

                  <div className={Style.automationSettingRow}>
                    <div className={Style.automationCardText}>
                      <strong>Quebra automática</strong>
                      <span>
                        Marca promessas vencidas automaticamente quando a
                        empresa quiser operar sem ação manual.
                      </span>
                    </div>
                    <button
                      type="button"
                      className={`${Style.automationToggle} ${promiseAutomation.autoBreakEnabled ? Style.automationToggleActive : ""}`}
                      onClick={() =>
                        setPromiseAutomation((prev) => ({
                          ...prev,
                          autoBreakEnabled: !prev.autoBreakEnabled,
                        }))
                      }
                    >
                      {promiseAutomation.autoBreakEnabled ? "Ligado" : "Desligado"}
                    </button>
                  </div>

                  <div className={Style.automationSettingRow}>
                    <div className={Style.automationCardText}>
                      <strong>Validar pagamento antes de quebrar</strong>
                      <span>
                        Antes de quebrar a promessa, o sistema verifica se o
                        cliente ainda tem faturas vencidas em aberto.
                      </span>
                    </div>
                    <button
                      type="button"
                      className={`${Style.automationToggle} ${promiseAutomation.checkPaymentBeforeBreak ? Style.automationToggleActive : ""}`}
                      onClick={() =>
                        setPromiseAutomation((prev) => ({
                          ...prev,
                          checkPaymentBeforeBreak: !prev.checkPaymentBeforeBreak,
                        }))
                      }
                    >
                      {promiseAutomation.checkPaymentBeforeBreak ? "Ligado" : "Desligado"}
                    </button>
                  </div>
                </div>

                <div className={Style.automationTimingPanel}>
                  <div className={Style.automationTimingHeader}>
                    <Settings2 size={16} />
                    <strong>Quando lembrar o cliente</strong>
                  </div>

                  <div className={Style.automationChipGroup}>
                    {[
                      { id: "day_before", label: "1 dia antes" },
                      { id: "same_day", label: "No dia do vencimento" },
                      { id: "both", label: "Nos dois momentos" },
                    ].map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`${Style.automationChip} ${promiseAutomation.reminderTiming === option.id ? Style.automationChipActive : ""}`}
                        onClick={() =>
                          setPromiseAutomation((prev) => ({
                            ...prev,
                            reminderTiming:
                              option.id as PromiseAutomationSettings["reminderTiming"],
                          }))
                        }
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            }
          />
        )}

        {!loading && totalPages > 1 && (
          <Pagination
            className={Style.Pagination}
            page={currentPage}
            totalPages={totalPages}
            onPrev={() => setCurrentPage((page) => Math.max(page - 1, 1))}
            onNext={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
            disablePrev={currentPage === 1}
            disableNext={currentPage === totalPages}
          />
        )}
      </div>
    </PageContainer>
  );
}
