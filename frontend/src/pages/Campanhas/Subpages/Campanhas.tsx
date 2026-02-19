//context
import FilterAltOutlinedIcon from "@mui/icons-material/FilterAltOutlined";
import {
  PageContainer,
  TitlePage,
  MyButton,
  InputFields,
  CardCampanhas,
  DynamicModal,
  Pagination,
} from "../../../componente/Index.ts";
// styles
import Style from "./../Styles/Campanhas.module.css";
/* HOOKS */
import { useCampaign } from "../../../hooks/useCampaign";

export default function Campanhas() {
  const {
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
  openCategoryDropdown,
  setOpenCategoryDropdown,
  campaignToDelete,
  setCampaignToDelete,
  loading,
  dropdownRef,
  filterIconRef,
  categories,  
  totalPages,
  paginated,
  handleDelete
} = useCampaign();
  return (
    <PageContainer className={Style.TemplatesContainer}>
      <div className={Style.Grafico}>
        <TitlePage title="Campanhas" className={Style.TitlePage} />

        <div className={Style.ContainerSubMenu}>
          <div className={Style.ContainerFiltro}>
            <MyButton
              text="Criar campanha"
              variant="secondary"
              className={Style.BtnCriarTemplate}
              onClick={() => navigate("/CreateCampanha")}
            />

            <MyButton
              text="Histórico"
              variant="secondary"
              className={Style.BtnCriarTemplate}
              onClick={() => navigate("/Historico")}
            />

            <div className={Style.ContainerFiltros}>
              <InputFields
                className={Style.InputFiltro}
                placeholder="Buscar campanha pelo nome"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
              />

              <div ref={filterIconRef} className={Style.FilterWrapper}>
                <FilterAltOutlinedIcon
                  className={`${Style.iconFilterDropdownTemplate} ${
                    categoryFilter ? Style.activeFilter : ""
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenCategoryDropdown((prev) => !prev);
                  }}
                />

                {openCategoryDropdown && (
                  <div ref={dropdownRef} className={Style.CategoryDropdown}>
                    <button
                      className={`${Style.CategoryOption} ${
                        categoryFilter === null ? Style.activeOption : ""
                      }`}
                      onClick={() => {
                        setCategoryFilter(null);
                        setOpenCategoryDropdown(false);
                      }}
                    >
                      Todas
                    </button>

                    {categories.map((category) => (
                      <button
                        key={category}
                        className={`${Style.CategoryOption} ${
                          categoryFilter === category ? Style.activeOption : ""
                        }`}
                        onClick={() => {
                          setCategoryFilter(category);
                          setOpenCategoryDropdown(false);
                        }}
                      >
                        {category}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={Style.Cards}>
        {loading && <p>Carregando campanhas...</p>}
        {!loading && paginated.length === 0 && (
          <p>Nenhuma campanha encontrada.</p>
        )}
        {paginated.map((campanha) => (
          <CardCampanhas
            key={campanha.id}
            campanha={campanha}
            onDelete={(c) => {
              setCampaignToDelete(c);
              setOpenDeleteModal(true);
            }}
          />
        ))}
      </div>

      <Pagination
        className={Style.Pagination}
        page={page}
        onPrev={() => setPage((p) => Math.max(p - 1, 1))}
        onNext={() => setPage((p) => Math.min(p + 1, totalPages))}
        disablePrev={page === 1}
        disableNext={page === totalPages}
      />

      {openDeleteModal && campaignToDelete && (
        <DynamicModal
          open
          type="warning"
          title="Excluir campanha"
          description={
            <>
              Tem certeza que deseja excluir a campanha{" "}
              <b>{campaignToDelete.name}</b>?<br />
              Essa ação não poderá ser desfeita.
            </>
          }
          onClose={() => {
            setOpenDeleteModal(false);
            setCampaignToDelete(null);
          }}
          buttons={[
            {
              label: "Cancelar",
              variant: "success",
              onClick: () => {
                setOpenDeleteModal(false);
                setCampaignToDelete(null);
              },
            },
            {
              label: loadingDelete ? "Excluindo..." : "Excluir",
              variant: "danger",
              onClick: () => {
                if (!campaignToDelete) return;
                handleDelete(campaignToDelete.id);
              },
            },
          ]}
        />
      )}
    </PageContainer>
  );
}
