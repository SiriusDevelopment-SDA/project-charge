import { useContext } from 'react'
import { TemplateContext } from '../context/contextTemplates'

export const useTemplate = () => {
  // Implement your custom logic here
  const context = useContext(TemplateContext)
  if (!context) {
    throw new Error('useTemplate must be used within a TemplateProvider')
  }
  return context
}