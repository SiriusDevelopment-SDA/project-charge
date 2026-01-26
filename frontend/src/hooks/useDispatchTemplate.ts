import { useContext } from 'react'
import { DispatchTemplateContext } from '../context/contextDisparo'

export const useDispatchTemplate = () => {
  // Implement your custom logic here
  const context = useContext(DispatchTemplateContext)
  if (!context)throw new Error('useDispatchTemplate must be used within a DispatchTemplateProvider')
  return context
}