import { createContext, useState } from 'react'
import type { Cliente,} from '../types'
import type { DateRange } from 'react-day-picker'

// eslint-disable-next-line react-refresh/only-export-components
type ICampaignContext = {
    selectedClientes: Cliente[]
    setSelectedClientes: React.Dispatch<React.SetStateAction<Cliente[]>>
    modoPage: "clientes" | "leads"
    openClientes: boolean
    setOpenClientes: React.Dispatch<React.SetStateAction<boolean>>
    openTemplate: boolean
    setOpenTemplate: React.Dispatch<React.SetStateAction<boolean>>
    openCategoria: boolean
    setOpenCategoria: React.Dispatch<React.SetStateAction<boolean>>
    nomeCampanha: string
    setNomeCampanha: React.Dispatch<React.SetStateAction<string>>
    horarioDisparoInicio: string
    setHorarioDisparoInicio: React.Dispatch<React.SetStateAction<string>>
    horarioDisparoFim: string
    setHorarioDisparoFim: React.Dispatch<React.SetStateAction<string>>
    dateRange: DateRange | undefined
    setDateRange: React.Dispatch<React.SetStateAction<DateRange | undefined>>
    cobrancaRecorrente: boolean
    setCobrancaRecorrente: React.Dispatch<React.SetStateAction<boolean>>
    openProsseguirModal: boolean
    setOpenProsseguirModal: React.Dispatch<React.SetStateAction<boolean>>
    isSubmitting: boolean
    setIsSubmitting: React.Dispatch<React.SetStateAction<boolean>>
    categoriaSelecionada: {
        id: string
        name: string
    } | null
    setCategoriaSelecionada: React.Dispatch<React.SetStateAction<{
        id: string
        name: string
    } | null>>  
}
export const CampaignContext = createContext<ICampaignContext>(
  {} as ICampaignContext,
)

export const CampaignProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
    
      const [selectedClientes, setSelectedClientes] = useState<Cliente[]>([]);
      const [modoPage] = useState<"clientes" | "leads">("clientes");
    
      const [openClientes, setOpenClientes] = useState(false);
      const [openTemplate, setOpenTemplate] = useState(false);
      const [openCategoria, setOpenCategoria] = useState(false);
      const [isSubmitting, setIsSubmitting] = useState(false);
    
      const [nomeCampanha, setNomeCampanha] = useState("");
      const [horarioDisparoInicio, setHorarioDisparoInicio] = useState("");
      const [horarioDisparoFim, setHorarioDisparoFim] = useState("");
    
      const [dateRange, setDateRange] = useState<DateRange | undefined>();
      const [cobrancaRecorrente, setCobrancaRecorrente] = useState(false);
    
      const [openProsseguirModal, setOpenProsseguirModal] = useState(false);
    
      const [categoriaSelecionada, setCategoriaSelecionada] = useState<{
        id: string;
        name: string;
      } | null>(null);


  return (
    <CampaignContext.Provider
      value={{
        selectedClientes,
        setSelectedClientes,
        modoPage,
        openClientes,
        setOpenClientes,
        openTemplate,
        setOpenTemplate,
        openCategoria,
        setOpenCategoria,
        nomeCampanha,
        setNomeCampanha,
        horarioDisparoInicio,
        setHorarioDisparoInicio,
        horarioDisparoFim,
        setHorarioDisparoFim,
        dateRange,
        setDateRange,
        cobrancaRecorrente,
        setCobrancaRecorrente,
        openProsseguirModal,
        setOpenProsseguirModal,
        categoriaSelecionada,
        setCategoriaSelecionada,
        isSubmitting,
        setIsSubmitting,
      }}
    >
      {children}
    </CampaignContext.Provider>
  )
}