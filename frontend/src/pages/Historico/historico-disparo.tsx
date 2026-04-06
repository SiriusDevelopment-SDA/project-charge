import "primereact/resources/themes/lara-dark-indigo/theme.css";
import "primereact/resources/primereact.min.css";
import "primeicons/primeicons.css";
import "primeflex/primeflex.css";
import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAccountParam } from "../../hooks/useAccountParam";
import { DynamicModal, MyButton, PageContainer, TitlePage } from "../../componente/Index";
import Table from "../../componente/table/tableHistory";
import { useHistorico } from "../../hooks/useHistorico";
import { useLatestDispatchReportController } from "../../hooks/controller/history/useLatestDispatchReportController";
import { useBatchStatusQuery } from "../../hooks/queries/useLatestDispatchReportQuery";
import type { DispatchBatchStatus } from "../../types";
import { createNormalizedSearchParams } from "../../utils/locationSearch";
import S from "./Styles/historico.module.css";

function getBatchStatusLabel(status?: DispatchBatchStatus["status"]) {
  if (status === "queued") return "Na fila";
  if (status === "processing") return "Em andamento";
  if (status === "completed") return "Concluido";
  if (status === "partial") return "Concluido com falhas";
  if (status === "failed") return "Falhou";
  return "Lote";
}

function formatBatchDate(value?: string | Date) {
  if (!value) return "-";

  const parsedDate = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? "-" : parsedDate.toLocaleString("pt-BR");
}

export function HistoricoDisparoPage() {
  const { histories } = useHistorico();
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = createNormalizedSearchParams(location.search);
  const isCampaignHistory = searchParams.get("scope") === "campaigns";
  const isDispatchHistory = searchParams.get("scope") === "manual";
  const liveReportScope = isCampaignHistory ? "campaigns" : isDispatchHistory ? "manual" : null;
  const account = useAccountParam();
  const batchId = searchParams.get("batchId");
  const { data: batchSummary } = useBatchStatusQuery(account, batchId);
  const {
    isLatestReportOpen,
    isLatestReportLoading,
    latestDispatchReport,
    latestDispatchProcessedRecipients,
    latestDispatchTotalRecipients,
    latestDispatchRemainingRecipients,
    latestDispatchStatusLabel,
    latestDispatchLastUpdatedAt,
    openLatestReport,
    closeLatestReport,
  } = useLatestDispatchReportController(liveReportScope, account);

  const latestDispatchStats = useMemo(() => {
    const records = latestDispatchReport?.records ?? [];

    return records.reduce(
      (accumulator, record) => {
        const normalizedStatus = String(record.status_sent ?? "").toLowerCase();

        if (normalizedStatus === "queued") accumulator.queued += 1;
        if (normalizedStatus === "pending") accumulator.pending += 1;
        if (normalizedStatus === "sent") accumulator.sent += 1;
        if (normalizedStatus === "delivered") accumulator.delivered += 1;
        if (normalizedStatus === "read") accumulator.read += 1;
        if (normalizedStatus === "failed") accumulator.failed += 1;
        if (normalizedStatus === "skipped") accumulator.skipped += 1;
        if (record.response) accumulator.responded += 1;

        return accumulator;
      },
      {
        queued: 0,
        pending: 0,
        sent: 0,
        delivered: 0,
        read: 0,
        failed: 0,
        skipped: 0,
        responded: 0,
      },
    );
  }, [latestDispatchReport?.records]);

  const pageTitle = useMemo(() => {
    if (batchId) {
      return "Historico do lote";
    }

    return isCampaignHistory ? "Historico de campanhas" : "Historicos de disparos";
  }, [batchId, isCampaignHistory]);

  const pageSubtitle = useMemo(() => {
    if (batchId) {
      return "Acompanhe apenas os disparos vinculados ao lote selecionado";
    }

    return isCampaignHistory
      ? "Acompanhe status e respostas dos disparos vinculados a campanhas"
      : "Acompanhe status e respostas dos envios realizados";
  }, [batchId, isCampaignHistory]);

  const latestReportButtonText = isCampaignHistory
    ? "Relatorio da ultima campanha"
    : "Relatorio do ultimo disparo";
  const latestReportModalTitle = isCampaignHistory
    ? "Relatorio em tempo real da ultima campanha"
    : "Relatorio em tempo real do ultimo disparo";
  const latestReportEmptyTitle = isCampaignHistory
    ? "Nenhum disparo de campanha recente"
    : "Nenhum disparo manual recente";
  const latestReportEmptyDescription = isCampaignHistory
    ? "Assim que uma campanha iniciar um novo lote, o resumo ao vivo aparece aqui."
    : "Assim que um novo lote for iniciado, o resumo ao vivo aparece aqui.";
  const latestReportEyebrow = isCampaignHistory ? "Ultimo lote de campanha" : "Ultimo lote manual";
  const latestReportFilteredScope = isCampaignHistory ? "campaigns" : "manual";

  const buildCampaignsSearch = () => {
    const nextSearch = createNormalizedSearchParams(location.search);
    nextSearch.delete("scope");
    nextSearch.delete("batchId");
    const query = nextSearch.toString();
    return query ? `?${query}` : "";
  };

  const buildHistoryWithoutBatchSearch = () => {
    const nextSearch = createNormalizedSearchParams(location.search);
    nextSearch.delete("batchId");
    const query = nextSearch.toString();
    return query ? `?${query}` : "";
  };

  return (
    <PageContainer className={S.page}>
      <TitlePage
        title={pageTitle}
        subtitle={pageSubtitle}
      >
        {liveReportScope && (
          <MyButton
            text={isLatestReportLoading ? "Carregando relatorio..." : latestReportButtonText}
            variant="secondary"
            disabled={isLatestReportLoading}
            onClick={openLatestReport}
          />
        )}
        {batchId && (
          <MyButton
            text="Limpar filtro do lote"
            variant="secondary"
            onClick={() => navigate(`/historico${buildHistoryWithoutBatchSearch()}`)}
          />
        )}
        {isCampaignHistory && (
          <MyButton
            text="Voltar para campanhas"
            variant="secondary"
            onClick={() => navigate(`/campanhas${buildCampaignsSearch()}`)}
          />
        )}
        {isDispatchHistory && (
          <MyButton
          text="Voltar para disparo ativo"
          variant="secondary"
          onClick={() => navigate(`/`)}
          />
        )}
      </TitlePage>

      {batchId && (
        <section className={S.batchSummaryCard}>
          <div className={S.batchSummaryHeader}>
            <div>
              <span className={S.batchSummaryEyebrow}>Filtro ativo</span>
              <strong>{getBatchStatusLabel(batchSummary?.status)}</strong>
              <p>Lote: {batchId}</p>
            </div>
            {batchSummary && (
              <span className={S.batchSummaryBadge}>
                {batchSummary.progressPercentage}% concluido
              </span>
            )}
          </div>

          {batchSummary ? (
            <>
              <div className={S.batchSummaryStats}>
                <span>{batchSummary.processedRecipients} processados</span>
                <span>{batchSummary.totalRecipients} no total</span>
                <span>{batchSummary.successCount} sucesso</span>
                <span>{batchSummary.failedCount} falhas</span>
                <span>{batchSummary.rateLimitPerSecond} msg/s</span>
              </div>

              <div className={S.batchSummaryBar}>
                <div
                  className={S.batchSummaryFill}
                  style={{ width: `${batchSummary.progressPercentage}%` }}
                />
              </div>
            </>
          ) : (
            <p className={S.batchSummaryFallback}>
              O historico esta filtrado por lote, mas o resumo do processamento nao foi carregado.
            </p>
          )}
        </section>
      )}

      <Table data={histories} className={S.table} />

      <DynamicModal
        open={isLatestReportOpen}
        type="custom"
        size="default"
        title={latestReportModalTitle}
        containerClassName={S.liveReportModalContainer}
        onClose={closeLatestReport}
        customContent={
          <div className={S.liveReportModal}>
            {!latestDispatchReport?.batch ? (
              <div className={S.liveReportEmpty}>
                <strong>{latestReportEmptyTitle}</strong>
                <p>{latestReportEmptyDescription}</p>
              </div>
            ) : (
              <>
                <div className={S.liveReportHero}>
                  <div>
                    <span className={S.liveReportEyebrow}>{latestReportEyebrow}</span>
                    <strong>{latestDispatchReport.batch.templateName || "Template sem nome"}</strong>
                    <p>{latestDispatchStatusLabel}</p>
                    <small className={S.liveReportHeroInfo}>
                      Lote {latestDispatchReport.batch.id} - atualizado em{" "}
                      {formatBatchDate(latestDispatchLastUpdatedAt)}
                    </small>
                  </div>
                  <div className={S.liveReportHeroMeta}>
                    <span>{latestDispatchReport.batch.progressPercentage}%</span>
                    <small>concluido</small>
                  </div>
                </div>

                <div className={S.liveReportProgress}>
                  <div
                    className={S.liveReportProgressFill}
                    style={{ width: `${latestDispatchReport.batch.progressPercentage}%` }}
                  />
                </div>

                <div className={S.liveReportNumbers}>
                  <article>
                    <span>Enviadas</span>
                    <strong>{latestDispatchProcessedRecipients}/{latestDispatchTotalRecipients}</strong>
                  </article>
                  <article>
                    <span>Sucesso</span>
                    <strong>{latestDispatchReport.batch.successCount}</strong>
                  </article>
                  <article>
                    <span>Falhas</span>
                    <strong>{latestDispatchReport.batch.failedCount}</strong>
                  </article>
                  <article>
                    <span>Ignorados</span>
                    <strong>{latestDispatchStats.skipped}</strong>
                  </article>
                  <article>
                    <span>Em fila</span>
                    <strong>{latestDispatchStats.queued}</strong>
                  </article>
                  <article>
                    <span>Entregues</span>
                    <strong>{latestDispatchStats.delivered}</strong>
                  </article>
                  <article>
                    <span>Lidas</span>
                    <strong>{latestDispatchStats.read}</strong>
                  </article>
                  <article>
                    <span>Respostas</span>
                    <strong>{latestDispatchStats.responded}</strong>
                  </article>
                  <article>
                    <span>Restantes</span>
                    <strong>{latestDispatchRemainingRecipients}</strong>
                  </article>
                  <article>
                    <span>Taxa</span>
                    <strong>{latestDispatchReport.batch.rateLimitPerSecond} msg/s</strong>
                  </article>
                  <article>
                    <span>Iniciado em</span>
                    <strong>{formatBatchDate(latestDispatchReport.batch.startedAt ?? latestDispatchReport.batch.createdAt)}</strong>
                  </article>
                  <article>
                    <span>Finalizado em</span>
                    <strong>{formatBatchDate(latestDispatchReport.batch.finishedAt)}</strong>
                  </article>
                </div>

                <div className={S.liveReportActions}>
                  <MyButton
                    text="Abrir no historico filtrado"
                    variant="secondary"
                    onClick={() => {
                      const nextSearch = new URLSearchParams();
                      if (account) {
                        nextSearch.set("account", account);
                      }
                      nextSearch.set("scope", latestReportFilteredScope);
                      nextSearch.set("batchId", latestDispatchReport.batch!.id);
                      navigate(`/historico?${nextSearch.toString()}`);
                      closeLatestReport();
                    }}
                  />
                </div>
              </>
            )}
          </div>
        }
      />
    </PageContainer>
  );
}
