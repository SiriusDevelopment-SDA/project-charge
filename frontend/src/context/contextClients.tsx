import { createContext, useEffect, useState } from 'react'
import { Api } from '../services/api'
import type { Cliente, IClientsContext, responseClients } from '../types'

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

  console.log("clientes", clients)
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
  
        // setClient(prev => [...prev, ...response.data.data])
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
  

  return (
    <ClientContext.Provider
      value={{ clients, setQuery }}
    >
      {children}
    </ClientContext.Provider>
  )
}