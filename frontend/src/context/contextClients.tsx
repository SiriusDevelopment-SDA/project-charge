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
  const [selectedClientes, setSelectedClientes] = useState<Cliente[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState<Record<string, boolean>>({})
  const [page, setPage] = useState<number>(1)
  const [limit, setLimit] = useState<number>(10)
  const [order, setOrder] = useState<"DESC" | "ASC">("DESC")
  const [query, setQuery] = useState<string>('')
  const mapClienteVars = {
    nome_cliente: "name",
    data_vencimento_fatura: "Data_de_vencimento",
    nome_empresa: "company_name",
    numero_contrato: "contrato",
    valor_fatura: "Valor_da_fatura",
    linha_digitavel_boleto: "linha_digitavel_boleto",
    link_boleto_pdf: "link_boleto_pdf",
  };

  console.log("context clientes", clients)
  useEffect(() => {
    const fetchClients = async () => {
      try {
        const queryString = window.location.search
        const urlParams = new URLSearchParams(queryString)

        const account = urlParams.get('account')

        const response = await Api.post<responseClients>('/search/clients', {
          account,
          query,
          page,
          limit,
          sortorder: order
        })

        setClient((prev) => {
          const map = new Map<string, Cliente>();

          [...prev, ...response.data.data].forEach((c) => {
            map.set(c.id, c); // garante unicidade
          });

          return Array.from(map.values());
        });

      } catch (error) {
        console.error('Erro ao buscar os clientes:', error)
      }
    }

    fetchClients()
  }, [query, page, limit, order])

  const fetchInvoices = async (client: Cliente) => {
    // evita buscar duas vezes
    if (client.invoices || loadingInvoices[client.id]) return

    setLoadingInvoices((prev) => ({
      ...prev,
      [client.id]: true,
    }))

    try {
      const res = await fetch(
        'https://webhooks.coraxy.com.br/webhook/faturas',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cnpj_cpf: client.cnpj_cpf,
          }),
        }
      )

      const invoices = await res.json()

      setClient((prev: Cliente[]) =>
        prev.map((c) =>
          c.id === client.id ? { ...c, invoices } : c
        )
      )
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingInvoices((prev) => ({
        ...prev,
        [client.id]: false,
      }))
    }
  }

  return (
    <ClientContext.Provider
      value={{ clients, setQuery, setPage, setOrder, setLimit, selectedClientes, setSelectedClientes, mapClienteVars, fetchInvoices }}
    >
      {children}
    </ClientContext.Provider>
  )
}