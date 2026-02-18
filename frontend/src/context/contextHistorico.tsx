// src/context/contextHistorico.tsx  (ou nome parecido)

import { createContext, useEffect, useState } from 'react'
import { Api } from '../services/api'
import type {
  history,
  IHistoricoContext,
  responseHistorico,
} from '../types'

// eslint-disable-next-line react-refresh/only-export-components
export const HistoricoContext = createContext<IHistoricoContext>(
  {} as IHistoricoContext,
)

export const HistoricoProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const [histories, setHistory] = useState<history[]>([])
  const [page, setPage] = useState<number>(1)
  const [limit, setLimit] = useState<number>(10)
  const [order, setOrder] = useState<'DESC' | 'ASC'>('DESC')
  const [query, setQuery] = useState<string>('')

  useEffect(() => {
    const fetchHistorico = async () => {
      try {
        const queryString = window.location.search
        const urlParams = new URLSearchParams(queryString)

        const account = urlParams.get('account')

        const response = await Api.post<responseHistorico>(
          '/template/relatories/search',
          {
            account,
            query,
            page,
            limit,
            sortorder: order,
          },
        )

        setHistory((prev) => {
          const map = new Map<string, history>()

          ;[...prev, ...response.data.data].forEach((h) => {
            map.set(h.id, h) // garante unicidade
          })

          return Array.from(map.values())
        })

      } catch (error) {
        console.error('Erro ao buscar o histórico:', error)
      }
    }

    fetchHistorico()
  }, [query, page, limit, order])

  return (
    <HistoricoContext.Provider
      value={{
        histories,
        setQuery,
        setPage,
        setLimit,
        setOrder,
      }}
    >
      {children}
    </HistoricoContext.Provider>
  )
}
