import { createContext, useEffect, useState } from 'react'
import { Api } from '../services/api'
import { toast } from 'react-toastify'
import type { Cliente, IClientsContext, Invoice, InvoiceBatchResponse, InvoiceError, InvoicesResponse, responseClients, ResultInvoices } from '../types'

// eslint-disable-next-line react-refresh/only-export-components
export const ClientContext = createContext<IClientsContext>(
  {} as IClientsContext
);

export const ClientProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [clients, setClient] = useState<Cliente[]>([])
  const [page, setPage] = useState<number>(1)
  const [limit, setLimit] = useState<number>(10)
  const [order, setOrder] = useState<"DESC" | "ASC">("DESC")
  const [query, setQuery] = useState<string>('')
  const [groupInvoices, setGroupInvoices] = useState<boolean>(false)

  useEffect(() => {
    setClient([]);
    const fetchAll = async () => {
      try {
        const queryString = window.location.search;
        const urlParams = new URLSearchParams(queryString);
        const account = urlParams.get('account');

        const response = await Api.post<responseClients>(
          '/clients/search',
          { account, query, page, limit, sortorder: order }
        );

        const clients = response.data.data;
        if (query.trim() !== '' && clients.length === 0) toast.warning(`Cliente com documento: ${query} não encontrado!!`)

        setClient((prev) => {
          const map = new Map<string, Cliente>();
          [...prev, ...clients].forEach((c) => map.set(c.id, c));
          return Array.from(map.values());
        });
  
      } catch (err) {
        console.error('Erro ao buscar clientes:', err);
      }
    };

    fetchAll();
  }, [query, page, limit, order, groupInvoices]);
  
  useEffect(() => {
    const fetchInvoices = async (clients: Cliente[]) => {
      try {
        console.log("aqui", clients)
        const res = await Api.post<InvoiceBatchResponse>(
          '/invoices/search',
          {
            documents: clients.map(c => ({
              cnpj_cpf: c.cnpj_cpf
            }))
          }
        );
    
        const { data: providers, errors, status,message } = res.data;

        const normalizeDoc = (doc?: string) =>
          doc?.replace(/\D/g, '') ?? '';
        const invoicesByDoc = providers.reduce<
          Record<string, InvoicesResponse>
        >((acc, provider) => {
          acc[normalizeDoc(provider.document)] = provider.invoices;
          return acc;
        }, {});
        
        if(status === "success")toast.success(`${message}`);
        if(status === "partial")toast.warning(`${message}`);
        if(status === "error")toast.error(`${message}`);
        if (errors?.length){
          errors.map((e: InvoiceError) => {
            toast.warning(`Cliente do documento: ${e.document} ${e.reason}`);
          })
        }
    
        setClient(prev =>
          prev.map(c => ({
            ...c,
            invoices:
              invoicesByDoc[normalizeDoc(c.cnpj_cpf)] ?? {
                status: "error",
                message: "Consulta não realizada",
                list: [],
              },
          }))
        );
        

    
      } catch (err) {
        console.error('Erro ao buscar invoices:', err);
        toast.error('Erro ao buscar faturas');
      }
    };
    if (groupInvoices && clients.length > 0) {
      fetchInvoices(
        clients.filter(c => !c.invoices || c.invoices.status === "error")
      );
    }
    
  }, [groupInvoices])

  console.log("clients", clients)
  return (
    <ClientContext.Provider
      value={{ 
        clients, 
        setQuery, 
        setPage, 
        setOrder, 
        setLimit, 
        setGroupInvoices 
      }}
    >
      {children}
    </ClientContext.Provider>
  );
};
