import { useContext } from 'react'
import { CampaignContext } from '../context/contextCampaigns'

export const useCampaign = () => {
  // Implement your custom logic here
  const context = useContext(CampaignContext)
  if (!context) {
    throw new Error('useCampaign must be used within a CampaignProvider')
  }
  return context
}