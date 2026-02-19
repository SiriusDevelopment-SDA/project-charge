import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { CampaignData, Cliente, } from '../types'
import type { DateRange } from 'react-day-picker'
import { useNavigate } from 'react-router-dom'
import { ListCampaignsContext } from './contextListCampaigns'
import { toast } from 'react-toastify'

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
  searchName: string
  setSearchName: React.Dispatch<React.SetStateAction<string>>
  campaigns: CampaignData[]
  loading: boolean
  deleteCampaign: (id: string) => Promise<{ success: boolean; error?: any; }>
  navigate: (path: string) => void
  page: number
  setPage: React.Dispatch<React.SetStateAction<number>>
  categoryFilter: string | null
  setCategoryFilter: React.Dispatch<React.SetStateAction<string | null>>
  openDeleteModal: boolean
  setOpenDeleteModal: React.Dispatch<React.SetStateAction<boolean>>
  loadingDelete: boolean
  setLoadingDelete: React.Dispatch<React.SetStateAction<boolean>>
  openCategoryDropdown: boolean
  setOpenCategoryDropdown: React.Dispatch<React.SetStateAction<boolean>>
  campaignToDelete: CampaignData | null
  setCampaignToDelete: React.Dispatch<React.SetStateAction<CampaignData | null>>
  LIMIT: number
  dropdownRef: React.RefObject<HTMLDivElement | null>
  filterIconRef: React.RefObject<HTMLDivElement | null>
  categoriaSelecionada: {
    id: string
    name: string
  } | null
  setCategoriaSelecionada: React.Dispatch<React.SetStateAction<{
    id: string
    name: string
  } | null>>
  categories: string[]
  filtered: CampaignData[]
  totalPages: number
  paginated: CampaignData[]
  handleDelete: (id: string) => Promise<void>
  useEffect: typeof import("react").useEffect
}
export const CampaignContext = createContext<ICampaignContext>(
  {} as ICampaignContext,
)

export const CampaignProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const filterIconRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const LIMIT = 8;
  const [campaignToDelete, setCampaignToDelete] = useState<CampaignData | null>(null);
  const [openCategoryDropdown, setOpenCategoryDropdown] = useState(false);
  const [loadingDelete, setLoadingDelete] = useState(false);
  const [openDeleteModal, setOpenDeleteModal] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const { campaigns, loading, deleteCampaign } = useContext(ListCampaignsContext);
  const [searchName, setSearchName] = useState("");
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

  // Gerar lista de categorias únicas para o dropdown de filtro
  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          campaigns
            .map((c) => c.category?.name)
            .filter(Boolean) as string[]
        )
      ),
    [campaigns],
  );
  // Filtrar campanhas com base no nome e categoria selecionada
  const filtered = useMemo(() => {
    return campaigns.filter((c) => {
      const matchName = c.name.toLowerCase().includes(searchName.toLowerCase());
      const matchCategory =
        !categoryFilter || c.category?.name === categoryFilter;
      return matchName && matchCategory;
    });
  }, [campaigns, searchName, categoryFilter]);

  // total de páginas para paginação
  const totalPages = Math.max(1, Math.ceil(filtered.length / LIMIT));
  // Campanhas a serem exibidas na página atual
  const paginated = filtered.slice((page - 1) * LIMIT, page * LIMIT);
  
  // remover campanha
  async function handleDelete(id: string) {
      try {
        setLoadingDelete(true);
        const result = await deleteCampaign(id);
        if (result.success) {
          toast.success("Campanha deletada com sucesso!");
          setOpenDeleteModal(false);
          setCampaignToDelete(null);
        } else {
          toast.error("Erro ao deletar campanha");
        }
      } catch {
        toast.error("Erro inesperado ao deletar campanha");
      } finally {
        setLoadingDelete(false);
      }
    }

    // Fechar dropdown de categorias ao clicar fora
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
          const target = event.target as Node;
          if (
            openCategoryDropdown &&
            dropdownRef.current &&
            !dropdownRef.current.contains(target) &&
            filterIconRef.current &&
            !filterIconRef.current.contains(target)
          ) {
            setOpenCategoryDropdown(false);
          }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
      }, [openCategoryDropdown]);


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
        searchName,
        setSearchName,
        navigate,
        page,
        setPage,
        categoryFilter,
        setCategoryFilter,
        openDeleteModal,
        setOpenDeleteModal,
        loadingDelete,
        setLoadingDelete,
        openCategoryDropdown,
        setOpenCategoryDropdown,
        campaignToDelete,
        setCampaignToDelete,
        campaigns,
        loading,
        deleteCampaign,
        LIMIT,
        dropdownRef,
        filterIconRef,
        categories,
        filtered,
        totalPages,
        paginated,
        handleDelete,
        useEffect
      }}
    >
      {children}
    </CampaignContext.Provider>
  )
}