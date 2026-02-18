import { createContext, useEffect, useState } from 'react'
import { Api } from '../services/api'

// Tipo da categoria
export type Category = {
  id: string
  name: string
  createdAt: Date
  updatedAt: Date
}

// Interface do contexto de categorias
export interface ICategoriesContext {
  categories: Category[]
  loading: boolean
  error: string | null
  fetchCategories: () => Promise<void>
  createCategory: (name: string, companyId: string) => Promise<{ success: boolean; error?: any }>
  updateCategory: (id: string, name: string) => Promise<{ success: boolean; error?: any }>
  deleteCategory: (id: string) => Promise<{ success: boolean; error?: any }>
}

export const CategoriesContext = createContext<ICategoriesContext>(
  {} as ICategoriesContext,
)

export const CategoriesProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Buscar todas as categorias
  const fetchCategories = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await Api.get<Category[]>('/categories')
      setCategories(response.data)
    } catch (err) {
      console.error('Erro ao buscar categorias:', err)
      setError('Erro ao carregar categorias')
    } finally {
      setLoading(false)
    }
  }

  // Criar nova categoria
  const createCategory = async (name: string, companyId: string) => {
    try {
      const response = await Api.post<Category>('/categories', {
        name,
        companyId,
      })
      setCategories((prev) => [response.data, ...prev])
      return { success: true }
    } catch (err) {
      console.error('Erro ao criar categoria:', err)
      return { success: false, error: err }
    }
  }

  // Atualizar categoria
  const updateCategory = async (id: string, name: string) => {
    try {
      const response = await Api.put<Category>(`/categories/${id}`, { name })
      setCategories((prev) =>
        prev.map((cat) => (cat.id === id ? response.data : cat))
      )
      return { success: true }
    } catch (err) {
      console.error('Erro ao atualizar categoria:', err)
      return { success: false, error: err }
    }
  }

  // Deletar categoria
  const deleteCategory = async (id: string) => {
    try {
      await Api.delete(`/categories/${id}`)
      setCategories((prev) => prev.filter((cat) => cat.id !== id))
      return { success: true }
    } catch (err) {
      console.error('Erro ao deletar categoria:', err)
      return { success: false, error: err }
    }
  }

  // Buscar categorias ao montar o componente
  useEffect(() => {
    fetchCategories()
  }, [])

  return (
    <CategoriesContext.Provider
      value={{
        categories,
        loading,
        error,
        fetchCategories,
        createCategory,
        updateCategory,
        deleteCategory,
      }}
    >
      {children}
    </CategoriesContext.Provider>
  )
}
