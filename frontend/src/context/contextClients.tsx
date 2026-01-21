import { createContext, useEffect, useState } from 'react'
import { Api } from '../services/api'
import type { Cliente, IClientsContext, responseClients } from '../types'

// eslint-disable-next-line react-refresh/only-export-components
export const ClientContext = createContext<IClientsContext>(
  {} as IClientsContext,
)

export const ClientProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const [clients, setClient] = useState<Cliente[]>([])
  const [page, setPage] = useState<number>(1)
  const [limit, setLimit] = useState<number>(10)
  const [order, setOrder] = useState<"DESC" | "ASC">("DESC")
  const [query, setQuery] = useState<string>('')
  useEffect(() => {
    const fetchAll = async () => {
      try {
        const queryString = window.location.search;
        const urlParams = new URLSearchParams(queryString);
        const account = urlParams.get('account');
  
        const response = await Api.post<responseClients>(
          '/search/clients',
          { account, query, page, limit, sortorder: order }
        );
  
        const clients = response.data.data;
  
        setClient((prev) => {
          const map = new Map<string, Cliente>();
          [...prev, ...clients].forEach((c) => map.set(c.id, c));
          return Array.from(map.values());
        });
  
         await fetchInvoices(clients);
  
      } catch (err) {
        console.error('Erro ao buscar clientes:', err);
      }
    };
  
    fetchAll();
  }, [query, page, limit, order]);
  

  const fetchInvoices = async (clients: Cliente[]) => {
    
    try {
      const res = await fetch(
        'https://webhooks.coraxy.com.br/webhook/faturas',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cnpj_cpf: clients.map(c => c.cnpj_cpf).join(','),
          }),
        }
      );
  
      const invoices = await res.json();
      // 🔑 agrupa faturas por cnpj_cpf
      const invoicesByDoc = invoices.reduce((acc: any, inv: any) => {
        acc[inv.cnpj_cpf] = acc[inv.cnpj_cpf] || [];
        acc[inv.cnpj_cpf].push(inv);
        return acc;
      }, {});
  
      setClient((prev) =>
        prev.map((c) => ({
          ...c,
          invoices: invoicesByDoc[c.cnpj_cpf] || [],
        }))
      );
  
    } catch (err) {
      console.error(err);
    }
  };
  console.log("clients", clients)
  return (
    <ClientContext.Provider
      value={{ clients, setQuery, setPage, setOrder, setLimit, fetchInvoices }}
    >
      {children}
    </ClientContext.Provider>
  )
}