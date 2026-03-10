import { useContext } from 'react'
import { TemplateContext } from '../context/contextTemplates'

export const useTemplate = () => {
  const context = useContext(TemplateContext)
  if (context === null) {
    throw new Error('useTemplate must be used within a TemplateProvider')
  }
  return context
}
