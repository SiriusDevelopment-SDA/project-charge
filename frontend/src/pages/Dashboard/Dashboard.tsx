import {
  PageContainer,
  BaseCard,
  Metricas,
  GraficoCobranca,
  GraficoDisparo,
  GraficoRelatorio,
  GraficoCampanhas,
} from "../../componente/Index";
import Style from "./Styles/Dashboard.module.css";
import { useMemo } from "react";
import { useDashboardCollectionsMetrics } from "../../hooks/controller/dashboard/useDashboardCollectionsMetrics";
import { CircleAlert, MessageSquareText, Flag } from "lucide-react";

export default function Dashboard() {
  const { metrics } = useDashboardCollectionsMetrics();

  const formattedLastResponse = useMemo(() => {
    if (!metrics.lastResponseAt) return "--";
    return new Date(metrics.lastResponseAt).toLocaleString("pt-BR");
  }, [metrics.lastResponseAt]);

  return (
    <PageContainer className={Style.DashboardContainer}>
      <div className={Style.cardsContainer}>
        <BaseCard classname={Style.cardMetricas}>
          <Metricas
            chave="Cobrados (30d)"
            valor={String(metrics.chargedCustomers30d)}
            classname={Style.contentMetricas}
          />
        </BaseCard>

        <BaseCard classname={Style.cardMetricas}>
          <Metricas
            chave="Retornaram após cobrança"
            valor={String(metrics.respondedAfterCharge30d)}
            classname={Style.contentMetricas}
            icon={<CircleAlert size={22} />}
          />
        </BaseCard>

        <BaseCard classname={Style.cardMetricas}>
          <Metricas
            chave="Taxa de retorno (30d)"
            valor={`${metrics.responseRate30d.toFixed(1).replace(".", ",")}%`}
            classname={Style.contentMetricas}
            icon={<Flag size={22} />}
          />
        </BaseCard>

        <BaseCard classname={Style.cardMetricas}>
          <Metricas
            chave="Sem retorno > 24h"
            valor={String(metrics.noResponseOver24h)}
            classname={Style.contentMetricas}
            icon={<MessageSquareText size={22} />}
          />
        </BaseCard>

        <BaseCard classname={Style.cardMetricas}>
          <Metricas
            chave="Follow-ups em aberto"
            valor={String(metrics.openFollowups)}
            classname={Style.contentMetricas}
          />
        </BaseCard>

        <BaseCard classname={Style.cardMetricas}>
          <Metricas
            chave="Último retorno"
            valor={formattedLastResponse}
            classname={Style.contentMetricas}
          />
        </BaseCard>
      </div>

      <div className={Style.graficosContainer}>
        <div className={Style.grafico1}>
          <GraficoCobranca />
        </div>
        <div className={Style.grafico2}>
          <GraficoDisparo />
        </div>
        <div className={Style.grafico3}>
          <GraficoRelatorio />
        </div>
        <div className={Style.grafico4}>
          <GraficoCampanhas />
        </div>
      </div>
    </PageContainer>
  );
}
