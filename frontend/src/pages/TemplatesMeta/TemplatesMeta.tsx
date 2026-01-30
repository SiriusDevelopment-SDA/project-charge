// React
import { useEffect, useState } from "react";
import { Pagination } from "../../componente/global/Pagination/Pagination";
import {
  PageContainer,
  TitlePage,
  MyButton,
  Dropdown,
  BaseCard,
} from "../../componente/Index";
import { useTemplate } from "../../hooks";

// Styles
import Style from "./Styles/TemplatesMeta.module.css";
import { Play, Trash2 } from "lucide-react";
import { TemplatesUsageCard } from "../../componente/global/Graficos/GraficoTemplates";

/* =========================
   TIPAGEM
========================= */
type Option = {
  id: string;
  name: string;
};

/* =========================
   COMPONENTE
========================= */
export default function Templates() {
  const { templates, setPage, setLimit, page } = useTemplate();

  /* =========================
     STATES
  ========================= */
  const [openTemplateId, setOpenTemplateId] = useState<string | null>(null);

  const [categoria, setCategoria] = useState<Option | null>(null);
  const [openCategoria, setOpenCategoria] =
    useState<"categoria" | null>(null);

  const [filtro, setFiltro] = useState<Option | null>(null);
  const [openFiltro, setOpenFiltro] =
    useState<"filtro" | null>(null);

  /* =========================
     LIMIT POR PÁGINA
  ========================= */
  useEffect(() => {
    setLimit(8);
  }, [setLimit]);

  /* =========================
     OPTIONS
  ========================= */
  const categoriaOptions: Option[] = [
    { id: "1", name: "Cobrança" },
    { id: "2", name: "Suporte" },
  ];

  const filtroOptions: Option[] = [
    { id: "3", name: "Mais usados" },
    { id: "4", name: "Menos usados" },
  ];

  /* =========================
     HANDLERS
  ========================= */
  function handleToggle(templateId: string) {
    setOpenTemplateId((prev) =>
      prev === templateId ? null : templateId
    );
  }

  /* =========================
     DADOS DO GRÁFICO
  ========================= */
  const data = [
    { id: 1, nome: "Aviso de cobrança", quantidade: 120 },
    { id: 2, nome: "Cobrança", quantidade: 95 },
    { id: 3, nome: "Comercial", quantidade: 80 },
    { id: 4, nome: "Outros", quantidade: 60 },
  ];

  return (
    <PageContainer className={Style.TemplatesContainer}>
      {/* =========================
         TOPO / GRÁFICO
      ========================= */}
      <div className={Style.Grafico}>
        <TitlePage title="Templates META" className={Style.TitlePage} />
        <TemplatesUsageCard data={data} />
      </div>

      {/* =========================
         SUBMENU / FILTROS
      ========================= */}
      <div className={Style.ContainerSubMenu}>
        <div className={Style.ContainerFiltro}>
          <MyButton
            text="Criar Template"
            variant="secondary"
            className={Style.BtnCriarTemplate}
          />

          <div className={Style.ContainerFiltros}>
            {/* FILTRO */}
            <Dropdown
              label="Filtrar por"
              options={filtroOptions}
              value={filtro}
              open={openFiltro === "filtro"}
              className={Style.DropdownCategoria}
              onOpen={() => setOpenFiltro("filtro")}
              onClose={() => setOpenFiltro(null)}
              onChange={(val) => setFiltro(val as Option)}
            />

            {/* CATEGORIA */}
            <Dropdown
              label="Categoria"
              options={categoriaOptions}
              value={categoria}
              open={openCategoria === "categoria"}
              className={Style.DropdownCategoria}
              onOpen={() => setOpenCategoria("categoria")}
              onClose={() => setOpenCategoria(null)}
              onChange={(val) => setCategoria(val as Option)}
            />
          </div>
        </div>
      </div>

      {/* =========================
         CARDS
      ========================= */}
      <div className={Style.Cards}>
        {templates.map((template) => {
          const isOpen = openTemplateId === template.id;

          return (
            <div key={template.id} className={Style.CardWrap}>
              <BaseCard classname={Style.TemplateCard}>
                {isOpen && (
                  <div className={Style.Balloon}>
                    <span className={Style.BalloonTitle}>
                      {template.name}
                    </span>
                    <p className={Style.BalloonMessage}>
                      {template.message}
                    </p>
                  </div>
                )}

                <div className={Style.CardInner}>
                  <div className={Style.CardHeader}>
                    <span className={Style.CardTitle}>
                      {template.name}
                    </span>

                    <div className={Style.ContainerCatogoria}>
                      <span className={Style.CardBadge}>
                        {template.category}
                      </span>

                      <div className={Style.CardIcons}>
                        <button className={Style.BtnUse}>
                          <Play size={16} />
                        </button>
                        <button className={Style.BtnDelete}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <p className={Style.CardMessage}>
                    {template.message}
                  </p>

                  <span
                    className={Style.VerMais}
                    onClick={() => handleToggle(template.id)}
                  >
                    {isOpen ? "Fechar" : "Ver mais"}
                  </span>
                </div>
              </BaseCard>
            </div>
          );
        })}
      </div>

      {/* =========================
         PAGINAÇÃO
      ========================= */}
      <Pagination
        className={Style.Pagination}
        page={page}
        onPrev={() => setPage((p) => Math.max(p - 1, 1))}
        onNext={() => setPage((p) => p + 1)}
        disablePrev={page === 1}
        disableNext={templates.length < 4}
      />
    </PageContainer>
  );
}
