import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { MyButton, PageContainer, Pagination, TitlePage } from "../../componente/Index";
import { useActivityLog } from "../../hooks/useActivityLog";
import type { ActivityCategory } from "../../hooks/queries/useActivityLogQuery";
import S from "./Styles/historico-geral.module.css";

const CATEGORY_META: Record<
  ActivityCategory,
  { label: string; className: string }
> = {
  create: { label: "Criação", className: S.catCreate },
  edit: { label: "Edição", className: S.catEdit },
  delete: { label: "Exclusão", className: S.catDelete },
  execute: { label: "Execução", className: S.catExecute },
  auth: { label: "Acesso", className: S.catAuth },
  other: { label: "Outros", className: S.catOther },
};

const CATEGORY_ORDER: ActivityCategory[] = [
  "create",
  "edit",
  "delete",
  "execute",
  "auth",
  "other",
];

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("pt-BR");
}

export function HistoricoGeralPage() {
  const navigate = useNavigate();
  const {
    rows,
    total,
    page,
    limit,
    categories,
    dateFrom,
    dateTo,
    setPage,
    setQuery,
    toggleCategory,
    clearCategories,
    setDateFrom,
    setDateTo,
  } = useActivityLog();

  return (
    <PageContainer className={S.page}>
      <TitlePage
        title="Auditoria"
        subtitle="Registro de todas as ações realizadas pelos usuários"
      >
        <MyButton
          text="Voltar ao perfil"
          variant="secondary"
          onClick={() => navigate("/perfil")}
        />
      </TitlePage>

      <div className={S.toolbar}>
        <div className={S.chips}>
          <button
            type="button"
            className={`${S.chip} ${categories.length === 0 ? S.chipActive : ""}`}
            onClick={clearCategories}
          >
            Todas
          </button>
          {CATEGORY_ORDER.map((category) => {
            const active = categories.includes(category);
            return (
              <button
                key={category}
                type="button"
                className={`${S.chip} ${active ? S.chipActive : ""}`}
                onClick={() => toggleCategory(category)}
              >
                {CATEGORY_META[category].label}
              </button>
            );
          })}
        </div>

        <div className={S.filters}>
          <label className={S.dateField}>
            <span>De</span>
            <input
              type="date"
              className={S.dateInput}
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </label>
          <label className={S.dateField}>
            <span>Até</span>
            <input
              type="date"
              className={S.dateInput}
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </label>
          {(dateFrom || dateTo) && (
            <button
              type="button"
              className={S.clearDates}
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
            >
              Limpar datas
            </button>
          )}

          <div className={S.search}>
            <Search size={16} className={S.searchIcon} />
            <input
              className={S.searchInput}
              placeholder="Buscar por usuário, ação ou alvo..."
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
      </div>

      <div className={S.tableWrap}>
        <table className={S.table}>
          <thead>
            <tr>
              <th>Data/Hora</th>
              <th>Usuário</th>
              <th>Categoria</th>
              <th>Ação</th>
              <th>Alvo</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className={S.empty}>
                  Nenhum registro encontrado.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const meta = CATEGORY_META[row.category] ?? CATEGORY_META.other;
                return (
                  <tr key={row.id}>
                    <td className={S.nowrap}>{formatDate(row.createdAt)}</td>
                    <td>
                      <div className={S.user}>
                        <strong>{row.agentName?.trim() || "-"}</strong>
                        <span>{row.agentEmail || ""}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`${S.badge} ${meta.className}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td>{row.action}</td>
                    <td className={S.target}>
                      {row.entity ? (
                        <span title={row.entityId ?? undefined}>
                          {row.entity}
                          {row.entityId ? (
                            <span className={S.targetId}>
                              {" "}
                              #{String(row.entityId).slice(0, 8)}
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        totalPages={total > 0 ? Math.ceil(total / limit) : undefined}
        onPrev={() => setPage((p) => Math.max(p - 1, 1))}
        onNext={() => setPage((p) => p + 1)}
        disablePrev={page <= 1}
        disableNext={page * limit >= total}
      />
    </PageContainer>
  );
}
