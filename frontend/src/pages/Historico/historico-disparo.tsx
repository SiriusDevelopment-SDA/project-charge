import "primereact/resources/themes/lara-dark-indigo/theme.css";
import "primereact/resources/primereact.min.css";
import "primeicons/primeicons.css";
import "primeflex/primeflex.css";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { DynamicModal, MyButton, PageContainer, TitlePage } from "../../componente/Index";
import Table from "../../componente/table/tableHistory";
import { useHistorico } from "../../hooks/useHistorico";
import { useLatestDispatchReportController } from "../../hooks/controller/history/useLatestDispatchReportController";
import { Api } from "../../services/api";
import type { DispatchBatchStatus } from "../../types";
import S from "./Styles/historico.module.css";

function getBatchStatusLabel(status?: DispatchBatchStatus["status"]) {
  if (status === "queued") return "Na fila";
  if (status === "processing") return "Em andamento";
  if (status === "completed") return "Concluido";
  if (status === "partial") return "Concluido com falhas";
  if (status === "failed") return "Falhou";
  return "Lote";
}

function getDispatchStatusLabel(status?: string) {
  if (status === "queued") return "Em fila";
  if (status === "pending") return "Pendente";
  if (status === "sent") return "Enviado";
  if (status === "delivered") return "Entregue";
  if (status === "read") return "Lido";
  if (status === "failed") return "Falhou";
  return status || "-";
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
  const [batchSummary, setBatchSummary] = useState<DispatchBatchStatus | null>(null);
  const searchParams = new URLSearchParams(location.search);
  const isCampaignHistory = searchParams.get("scope") === "campaigns";
  const isDispatchHistory = searchParams.get("scope") === "manual";
  const liveReportScope = isCampaignHistory ? "campaigns" : isDispatchHistory ? "manual" : null;
  const account = searchParams.get("account");
  const batchId = searchParams.get("batchId");
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
        responded: 0,
      },
    );
  }, [latestDispatchReport?.records]);

  useEffect(() => {
    if (!account || !batchId) {
      setBatchSummary(null);
      return;
    }

    let cancelled = false;
    let intervalId: number | undefined;

    const fetchBatchSummary = async () => {
      try {
        const response = await Api.post<DispatchBatchStatus>("/templates/batches/status", {
          account,
          batchId,
        });

        if (!cancelled) {
          setBatchSummary(response.data);
          if (
            response.data.status === "completed" ||
            response.data.status === "partial" ||
            response.data.status === "failed"
          ) {
            if (intervalId) {
              window.clearInterval(intervalId);
            }
          }
        }
      } catch {
        if (!cancelled) {
          setBatchSummary(null);
        }
      }
    };

    void fetchBatchSummary();
    intervalId = window.setInterval(() => {
      void fetchBatchSummary();
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [account, batchId]);

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
    const nextSearch = new URLSearchParams(location.search);
    nextSearch.delete("scope");
    nextSearch.delete("batchId");
    const query = nextSearch.toString();
    return query ? `?${query}` : "";
  };

  const buildHistoryWithoutBatchSearch = () => {
    const nextSearch = new URLSearchParams(location.search);
    nextSearch.delete("batchId");
    const query = nextSearch.toString();
    return query ? `?${query}` : "";
  };

  return (
    <PageContainer>
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
        title={latestReportModalTitle}
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

                <div className={S.liveReportList}>
                  <div className={S.liveReportListHeader}>
                    <span>Relatorio completo</span>
                    <small>
                      {latestDispatchReport.records.length} registros carregados - atualizacao ao vivo
                    </small>
                  </div>

                  <div className={S.liveReportRows}>
                    {latestDispatchReport.records.map((record) => (
                      <div key={record.id} className={S.liveReportRow}>
                        <div className={S.liveReportRowMain}>
                          <strong>{record.name || "Sem nome"}</strong>
                          <span>{record.number || "-"}</span>
                          {record.message && (
                            <small className={S.liveReportRowMessage}>{record.message}</small>
                          )}
                        </div>
                        <div className={S.liveReportRowMeta}>
                          <span className={S.liveReportRowStatus}>
                            {getDispatchStatusLabel(record.status_sent)}
                          </span>
                          <span>
                            {record.response
                              ? `Respondeu em ${formatBatchDate(record.response_at)}`
                              : "Sem retorno"}
                          </span>
                          <span>{formatBatchDate(record.date_dispatch ?? record.createdAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        }
      />
    </PageContainer>
  );
}

