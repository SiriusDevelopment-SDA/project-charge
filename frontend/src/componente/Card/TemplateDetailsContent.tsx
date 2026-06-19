"use client";

import { useTemplateMetricsQuery } from "../../hooks/queries/useDashboardQueries";
import { formatDateBR } from "../../utils/date";
import Style from "./TemplateDetailsContent.module.css";

type Props = {
  templateId: string;
  templateName: string;
  onClose: () => void;
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const numberFormatter = new Intl.NumberFormat("pt-BR");

function formatPercent(value: number) {
  return `${numberFormatter.format(Math.round(value * 10) / 10)}%`;
}

export function TemplateDetailsContent({ templateId, templateName, onClose }: Props) {
  const { data, isLoading, isError } = useTemplateMetricsQuery(templateId, true);

  const isEmpty = !isLoading && !isError && (data?.dispatched ?? 0) === 0;

  return (
    <div className={Style.detailsModalContent}>
      <div className={Style.detailsModalHeader}>
        <h4 className={Style.detailsModalTitle}>{templateName}</h4>
        <p className={Style.detailsModalSubtitle}>Desempenho deste template</p>
      </div>

      {isLoading && (
        <div className={Style.skeletonGrid} aria-hidden="true">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className={Style.skeletonCard} />
          ))}
        </div>
      )}

      {isError && (
        <p className={Style.errorState}>
          Não foi possível carregar as métricas deste template. Tente novamente em instantes.
        </p>
      )}

      {!isLoading && !isError && isEmpty && (
        <p className={Style.emptyState}>Nenhum disparo com este template ainda.</p>
      )}

      {!isLoading && !isError && !isEmpty && data && (
        <div className={Style.metricsGrid}>
          <div className={Style.metricCard}>
            <span className={Style.metricLabel}>Disparos</span>
            <span className={Style.metricValue}>{numberFormatter.format(data.dispatched)}</span>
          </div>

          <div className={Style.metricCard}>
            <span className={Style.metricLabel}>Entregues</span>
            <span className={Style.metricValue}>{numberFormatter.format(data.delivered)}</span>
            <span className={`${Style.metricSub} ${Style.metricSubDanger}`}>
              {numberFormatter.format(data.failed)} falha{data.failed !== 1 ? "s" : ""}
            </span>
          </div>

          <div className={Style.metricCard}>
            <span className={Style.metricLabel}>Retornos</span>
            <span className={Style.metricValue}>{numberFormatter.format(data.responded)}</span>
          </div>

          <div className={Style.metricCard}>
            <span className={Style.metricLabel}>Efetividade</span>
            <span className={`${Style.metricValue} ${Style.metricValueGold}`}>
              {formatPercent(data.responseRate)}
            </span>
          </div>

          <div className={`${Style.metricCard} ${Style.metricCardWide}`}>
            <span className={Style.metricLabel}>Valor recebido</span>
            <span className={`${Style.metricValue} ${Style.metricValueGold}`}>
              {currencyFormatter.format(data.amountRecovered)}
            </span>
          </div>

          <div className={`${Style.metricCard} ${Style.metricCardWide}`}>
            <span className={Style.metricLabel}>Período</span>
            <span className={Style.periodValue}>
              {formatDateBR(data.firstDispatchAt)} – {formatDateBR(data.lastDispatchAt)}
            </span>
          </div>
        </div>
      )}

      <button type="button" className={Style.detailsModalClose} onClick={onClose}>
        Fechar
      </button>
    </div>
  );
}
