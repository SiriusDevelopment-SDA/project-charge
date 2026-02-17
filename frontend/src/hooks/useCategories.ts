import { useContext } from 'react'
import { CategoriesContext } from '../context/contextCategories'

export const useCategories = () => {
  const context = useContext(CategoriesContext)
  
  if (!context) {
    throw new Error('useCategories deve ser usado dentro de CategoriesProvider')
  }
  
  return context
}
