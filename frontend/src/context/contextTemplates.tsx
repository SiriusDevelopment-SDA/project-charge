import { createContext, useEffect, useState } from 'react'
import { Api } from '../services/api'
import type { Template, ITemplatesContext, responseTemplate } from '../types'

export const TemplateContext = createContext<ITemplatesContext>(
  {} as ITemplatesContext,
)

export const TemplateProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const [templates, setTemplates] = useState<Template[]>([])
  const [page, setPage] = useState<number>(1)
  const [limit, setLimit] = useState<number>(10)
  const [order, setOrder] = useState<"DESC" | "ASC">("DESC")
  const [query, setQuery] = useState<string>('')

  console.log("templates", templates)
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const queryString = window.location.search
        const urlParams = new URLSearchParams(queryString)
  
        const account = urlParams.get('account')
        
        const response = await Api.post<responseTemplate>('/search/templates', {
          account,
          query,
          page,
          limit,
          sortorder: order
        })
  
        // setClient(prev => [...prev, ...response.data.data])
        setTemplates((prev) => {
          const map = new Map<string, Template>();
        
          [...prev, ...response.data.data].forEach((c) => {
            map.set(c.id, c); // garante unicidade
          });
        
          return Array.from(map.values());
        });
        console.log('response templates', response)
      } catch (error) {
        console.error('Erro ao buscar os clientes:', error)
      }
    }
  
    fetchTemplates()
  }, [query, page, limit, order])
  

  return (
    <TemplateContext.Provider
      value={{ templates, setQuery }}
    >
      {children}
    </TemplateContext.Provider>
  )
}