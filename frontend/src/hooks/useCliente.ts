import { useContext } from 'react'
import { ClientContext } from '../context/contextClients'

export const useClient = () => {
  // Implement your custom logic here
  const context = useContext(ClientContext)
  if (!context) {
    throw new Error('useClient must be used within a ClientProvider')
  }
  return context
}