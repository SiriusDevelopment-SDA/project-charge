import { createContext, useEffect, useState } from 'react'
import { Api } from '../services/api'
import type { Template, ITemplatesContext, responseTemplate } from '../types'

// eslint-disable-next-line react-refresh/only-export-components
export const TemplateContext = createContext<ITemplatesContext>(
  {} as ITemplatesContext,
)

export const TemplateProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const [templates, setTemplates] = useState<Template[]>([])
  const [searchTemplateName, setSearchTemplateName] = useState("")
  const [categoryTemplateFilter, setCategoryTemplateFilter] = useState<string | null>(null)
  const [page, setPage] = useState<number>(1)
  const [limit, setLimit] = useState<number>(10)
  const [order, setOrder] = useState<"DESC" | "ASC">("DESC")
  const [query, setQuery] = useState<string>('')

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const queryString = window.location.search
        const urlParams = new URLSearchParams(queryString)

        const account = urlParams.get('account')

        const response = await Api.post<responseTemplate>('/template/search', {
          account,
          query,
          page,
          limit,
          sortorder: order
        })

        setTemplates((prev) => {
          const map = new Map<string, Template>();

          [...prev, ...response.data.data].forEach((c) => {
            map.set(c.id, c); // garante unicidade
          });
        setTemplates(response.data.data.filter(i => i.isEnabled === true));


          return Array.from(map.values());
        });
      } catch (error) {
        console.error('Erro ao buscar os clientes:', error)
      }
    }

    fetchTemplates()
  }, [query, page, limit, order])

  const deleteTemplate = async (id: string) => {
    try {
      await Api({
        method: 'POST',
        url: '/template/delete',
        data: { templateId: id }
      })
      
      setTemplates((prev) => prev.filter((template) => template.id !== id))
      
      return { success: true }
    } catch (error) {
      console.error('Erro ao deletar template:', error)
      return { success: false, error }
    }
  }
  return (
    <TemplateContext.Provider
      value={{ templates, categoryTemplateFilter, setCategoryTemplateFilter, searchTemplateName, setSearchTemplateName, setQuery, setPage, setLimit, setOrder, page, deleteTemplate }}
    >
      {children}
    </TemplateContext.Provider>
  )
}