import { createContext, useEffect, useState } from 'react'
import { Api } from '../services/api'
import type { CampaignData } from '../types'

export interface IListCampaignsContext {
  campaigns: CampaignData[]
  loading: boolean
  fetchCampaigns: () => Promise<void>
  deleteCampaign: (id: string) => Promise<{ success: boolean; error?: any }>
}

export const ListCampaignsContext = createContext<IListCampaignsContext>(
  {} as IListCampaignsContext,
)

export const ListCampaignsProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const [campaigns, setCampaigns] = useState<CampaignData[]>([])
  const [loading, setLoading] = useState(false)

  const fetchCampaigns = async () => {
    setLoading(true)
    try {
      const queryString = window.location.search
      const urlParams = new URLSearchParams(queryString)
      const account = urlParams.get('account')

      const url = account ? `/campaigns?account=${account}` : '/campaigns'
      const response = await Api.get<CampaignData[]>(url)
      setCampaigns(response.data)
    } catch (error) {
      console.error('Erro ao buscar campanhas:', error)
    } finally {
      setLoading(false)
    }
  }

  const deleteCampaign = async (id: string) => {
    try {
      await Api.delete(`/campaigns/${id}`)
      setCampaigns((prev) => prev.filter((c) => c.id !== id))
      return { success: true }
    } catch (error) {
      console.error('Erro ao deletar campanha:', error)
      return { success: false, error }
    }
  }

  useEffect(() => {
    fetchCampaigns()
  }, [])

  return (
    <ListCampaignsContext.Provider
      value={{ campaigns, loading, fetchCampaigns, deleteCampaign }}
    >
      {children}
    </ListCampaignsContext.Provider>
  )
}
