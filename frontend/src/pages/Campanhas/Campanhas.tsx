import FilterAltOutlinedIcon from "@mui/icons-material/FilterAltOutlined";
import {
  PageContainer,
  TitlePage,
  MyButton,
  InputFields,
  CardCampaigns,
  Pagination,
} from "../../componente/Index.ts";
import Style from "./Styles/Campanhas.module.css";
import { useCampaign } from "../../hooks/useCampaign.ts";
import { useCampaignMetricsQuery } from "../../hooks/queries/useCampaignsQuery.ts";
import type { CampaignData, CampaignMetrics, Category } from "../../types/champaignApiTypes.ts";
import { useLocation, useNavigate } from "react-router-dom";
import { useRef } from "react";
import { useCampaignListController } from "../../hooks/controller/campaigns/useCampaignListController.ts";
import { isCampaignActive } from "../../utils/campaign.ts";
import { buildNormalizedSearch, createNormalizedSearchParams } from "../../utils/locationSearch.ts";

const DEFAULT_FILTERED_METRICS: CampaignMetrics = {
  totalCampaigns: 0,
  activeCampaigns: 0,
  dispatchesToday: 0,
  totalDispatch: 0,
  totalDispatchSuccess: 0,
  totalDispatchToday: 0,
  totalDispatchSuccessToday: 0,
  totalDispatch24h: 0,
  totalDispatchSuccess24h: 0,
  deliveryRateTotal: 0,
  deliveryRateToday: 0,
  deliveryRate24h: 0,
  nextDispatchTime: null,
  nextDispatchLabel: "Sem disparos agendados",
};

export function Campanhas() {
  const navigate = useNavigate();
  const location = useLocation();
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const filterIconRef = useRef<HTMLDivElement | null>(null);

  const {
    campaigns,
    categories,
    loading,
    deleteCampaign,
    updateCampaignStatus,
  } = useCampaign();

  const {
    filteredCampaigns,
    searchName,
    categoryFilter,
    page,
    totalPages,
    paginatedCampaigns,
    openDropdown,
    setPage,
    updateSearch,
    selectCategory,
    toggleDropdown,
  } = useCampaignListController({ campaigns, categories });
  const { data: metrics = DEFAULT_FILTERED_METRICS } = useCampaignMetricsQuery({
    search: searchName,
    category: categoryFilter,
  });
  const activeCampaignsCount = filteredCampaigns.filter((campaign) =>
    isCampaignActive(campaign),
  ).length;
  const totalCampaignsCount = filteredCampaigns.length;

  const confirmDelete = async (campaign: CampaignData) => {
    if (!campaign) return;
    await deleteCampaign(campaign.id);
  };

  const formatPercent = (value: number) =>
    `${value.toFixed(1).replace(".", ",")}%`;
  const normalizedSearch = buildNormalizedSearch(location.search);

  const buildCampaignHistorySearch = () => {
    const searchParams = createNormalizedSearchParams(location.search);
    searchParams.set("scope", "campaigns");
    const nextSearch = searchParams.toString();
    return nextSearch ? `?${nextSearch}` : "";
  };

  return (
    <PageContainer className={Style.TemplatesContainer}>
      <div className={Style.Grafico}>
        <TitlePage
          title="Campanhas"
          subtitle="Gerencie e acompanhe suas campanhas ativos"
          className={Style.TitlePage}
        />
        <div className={Style.ContainerSubMenu}>
          <div className={Style.ContainerFiltro}>
            <MyButton
              text="Criar campanha"
              variant="secondary"
              className={Style.BtnCriarTemplate}
              onClick={() => navigate(`/createCampanha${normalizedSearch}`)}
            />

            <MyButton
              text="Histórico"
              variant="secondary"
              className={Style.BtnCriarTemplate}
              onClick={() => navigate(`/historico${buildCampaignHistorySearch()}`)}
            />

            <div className={Style.ContainerFiltros}>
              <InputFields
                className={Style.InputFiltro}
                placeholder="Buscar campanha pelo nome"
                value={searchName}
                onChange={(e) => updateSearch(e.target.value)}
              />

              <div
                ref={filterIconRef}
                className={Style.FilterWrapper}
                onBlur={(event) => {
                  const next = event.relatedTarget as Node | null;
                  if (!next || !filterIconRef.current?.contains(next)) {
                    if (openDropdown === "category") {
                      toggleDropdown("category");
                    }
                  }
                }}
                tabIndex={0}
              >
                <FilterAltOutlinedIcon
                  className={`${Style.iconFilterDropdownTemplate} ${
                    categoryFilter ? Style.activeFilter : ""
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleDropdown("category");
                  }}
                />

                {openDropdown === "category" && (
                  <div ref={dropdownRef} className={Style.CategoryDropdown}>
                    <button
                      className={`${Style.CategoryOption} ${
                        categoryFilter === null ? Style.activeOption : ""
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        selectCategory(null);
                      }}
                    >
                      Todas
                    </button>

                    {categories.map((category: Category) => (
                      <button
                        key={category.id}
                        className={`${Style.CategoryOption} ${
                          categoryFilter === category.name
                            ? Style.activeOption
                            : ""
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          selectCategory(category.name);
                        }}
                      >
                        {category.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <section className={Style.metricsGrid}>
        <article className={Style.metricCard}>
          <span>CAMPANHAS ATIVAS</span>
          <strong>{activeCampaignsCount}</strong>
          <p>
            {activeCampaignsCount} ativas de {totalCampaignsCount} cadastradas
          </p>
        </article>

        <article className={`${Style.metricCard} ${Style.metricCardDual}`}>
          <div className={Style.dualMetricTop}>
            <div className={Style.dualMetricCol}>
              <span>DISPAROS HOJE</span>
              <strong>{metrics.dispatchesToday.toLocaleString("pt-BR")}</strong>
            </div>

            <div className={Style.dualMetricCol}>
              <span>ENTREGAS</span>
              <strong>{formatPercent(metrics.deliveryRateToday)}</strong>
            </div>
            
          </div>
          <div className={Style.dualMetricFooter}>
            <p>Enviados vs entregues</p>
            <span>—</span>
            <p>tempo real</p>
          </div>
        </article>

        <article className={Style.metricCard}>
          <span>TAXA DE ENTREGA TOTAL</span>
          <strong>{formatPercent(metrics.deliveryRateTotal)}</strong>
          <p>janela completa</p>
        </article>

        <article className={Style.metricCard}>
          <span>PRÓXIMO DISPARO</span>
          <strong>{metrics.nextDispatchTime ?? "--:--"}</strong>
          <p>{metrics.nextDispatchLabel}</p>
        </article>
      </section>

      <div className={Style.Cards}>
        {loading.type === "CAMPAIGN" && loading.status && (
          <p>Carregando campanhas...</p>
        )}

        {!loading.status && paginatedCampaigns.length === 0 && (
          <p>Nenhuma campanha encontrada.</p>
        )}

        {paginatedCampaigns.map((campaign: CampaignData) => (
          <CardCampaigns
            key={campaign.id}
            campaign={campaign}
            onDelete={confirmDelete}
            onStatusChanged={(id, isEnabled) => updateCampaignStatus(id, isEnabled)}
          />
        ))}
      </div>

      <Pagination
        className={Style.Pagination}
        page={page}
        onPrev={() => setPage((prev) => Math.max(prev - 1, 1))}
        onNext={() => setPage((prev) => Math.min(prev + 1, totalPages))}
        disablePrev={page === 1}
        disableNext={page === totalPages}
      />
    </PageContainer>
  );
}
