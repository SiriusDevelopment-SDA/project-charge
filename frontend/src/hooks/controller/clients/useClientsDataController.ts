import { useCallback, useEffect, useReducer, useState } from "react";
import { toast } from "react-toastify";
import { ClientService } from "../../../services/client/client.service";
import { getErrorMessage } from "../../../utils/error";
import type {
  Cliente,
  InvoiceError,
  InvoicesResponse,
  Service,
} from "../../../types";

type State = {
  clients: Cliente[];
  services: Service[];
  page: number;
  limit: number;
  order: "DESC" | "ASC";
  query: string;
  groupInvoices: boolean;
  groupServices: boolean;
  loadingInvoices: boolean;
};

type Action =
  | { type: "SET_CLIENTS"; payload: Cliente[] }
  | { type: "UPDATE_INVOICES"; payload: Cliente[] }
  | { type: "SET_SERVICES"; payload: Service[] }
  | { type: "SET_PAGE"; payload: number }
  | { type: "SET_LIMIT"; payload: number }
  | { type: "SET_ORDER"; payload: "DESC" | "ASC" }
  | { type: "SET_QUERY"; payload: string }
  | { type: "SET_GROUP_INVOICES"; payload: boolean }
  | { type: "SET_GROUP_SERVICES"; payload: boolean }
  | { type: "SET_LOADING_INVOICES"; payload: boolean };

const initialState: State = {
  clients: [],
  services: [],
  page: 1,
  limit: 10,
  order: "DESC",
  query: "",
  groupInvoices: false,
  groupServices: false,
  loadingInvoices: false,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_CLIENTS":
      return { ...state, clients: action.payload };
    case "UPDATE_INVOICES":
      return { ...state, clients: action.payload };
    case "SET_SERVICES":
      return { ...state, services: action.payload };
    case "SET_PAGE":
      return { ...state, page: action.payload };
    case "SET_LIMIT":
      return { ...state, limit: action.payload };
    case "SET_ORDER":
      return { ...state, order: action.payload };
    case "SET_QUERY":
      if (state.query === action.payload && state.page === 1) return state;
      return { ...state, query: action.payload, page: 1 };
    case "SET_GROUP_INVOICES":
      if (state.groupInvoices === action.payload) return state;
      return { ...state, groupInvoices: action.payload };
    case "SET_GROUP_SERVICES":
      if (state.groupServices === action.payload) return state;
      return { ...state, groupServices: action.payload };
    case "SET_LOADING_INVOICES":
      return { ...state, loadingInvoices: action.payload };
    default:
      return state;
  }
}

const normalizeDoc = (doc?: string) => doc?.replace(/\D/g, "") ?? "";

export function useClientsDataController() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const setQuery = useCallback(
    (value: string) => dispatch({ type: "SET_QUERY", payload: value }),
    []
  );
  const setPage = useCallback(
    (value: number) => dispatch({ type: "SET_PAGE", payload: value }),
    []
  );
  const setOrder = useCallback(
    (value: "DESC" | "ASC") => dispatch({ type: "SET_ORDER", payload: value }),
    []
  );
  const setLimit = useCallback(
    (value: number) => dispatch({ type: "SET_LIMIT", payload: value }),
    []
  );
  const setGroupInvoices = useCallback(
    (value: boolean) => dispatch({ type: "SET_GROUP_INVOICES", payload: value }),
    []
  );
  const setGroupServices = useCallback(
    (value: boolean) => dispatch({ type: "SET_GROUP_SERVICES", payload: value }),
    []
  );

  const fetchInvoices = useCallback(
    async (targetClients: Cliente[]): Promise<Cliente[]> => {
      try {
        dispatch({ type: "SET_LOADING_INVOICES", payload: true });

        const response = await ClientService.searchInvoices(
          targetClients.map((client) => client.cnpj_cpf)
        );

        const { data: providers, errors, status, message } = response.data;

        const invoicesByDoc = providers.reduce<Record<string, InvoicesResponse>>(
          (acc, provider) => {
            acc[normalizeDoc(provider.document)] = provider.invoices;
            return acc;
          },
          {}
        );

        if (status === "success") toast.success(message);
        if (status === "partial") toast.warning(message);
        if (status === "error") toast.error(message);

        errors?.forEach((error: InvoiceError) => {
          toast.warning(`Cliente do documento: ${error.document} ${error.reason}`);
        });

        const updatedClients = state.clients.map((client) => ({
          ...client,
          invoices: invoicesByDoc[normalizeDoc(client.cnpj_cpf)] ?? client.invoices,
        }));

        dispatch({ type: "UPDATE_INVOICES", payload: updatedClients });

        return targetClients.map((client) => ({
          ...client,
          invoices: invoicesByDoc[normalizeDoc(client.cnpj_cpf)] ?? client.invoices,
        }));
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Erro ao buscar faturas."));
        return targetClients;
      } finally {
        dispatch({ type: "SET_LOADING_INVOICES", payload: false });
      }
    },
    [state.clients]
  );

  const fetchServices = useCallback(
    async (companyId?: string) => {
      try {
        const id = companyId ?? state.clients[0]?.company?.id;
        if (!id) return;

        const response = await ClientService.listServices(id);
        dispatch({ type: "SET_SERVICES", payload: response.data });
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Erro ao buscar servicos."));
      }
    },
    [state.clients]
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedQuery(state.query);
    }, 350);

    return () => clearTimeout(timeout);
  }, [state.query]);

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const account = new URLSearchParams(window.location.search).get("account");

        const response = await ClientService.searchClients({
          account,
          query: debouncedQuery,
          page: state.page,
          limit: state.limit,
          sortorder: state.order,
          relationService: state.groupServices,
        });

        const fetchedClients = response.data.data ?? [];

        if (debouncedQuery.trim() !== "" && fetchedClients.length === 0) {
          toast.warning(`Nenhum cliente encontrado para: ${debouncedQuery}`);
        }

        dispatch({ type: "SET_CLIENTS", payload: fetchedClients });
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Erro ao buscar clientes."));
      }
    };

    void fetchClients();
  }, [debouncedQuery, state.page, state.limit, state.order, state.groupServices]);

  return {
    clients: state.clients,
    services: state.services,
    setQuery,
    setPage,
    setOrder,
    setLimit,
    setGroupInvoices,
    setGroupServices,
    fetchInvoices,
    fetchServices,
  };
}
