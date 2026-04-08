import { useState, useEffect, useRef } from "react";
import {
  GraficoCobranca,
  GraficoDisparo,
  GraficoRelatorio,
  GraficoCampanhas,
  GraficoConversao,
  GraficoFunil,
  GraficoPaymentProfile,
  GraficoPromessas,
  GraficoPrevisao,
  GraficoAging,
  PageContainer,
  TitlePage,
} from "../../componente/Index";
import Style from "./Styles/Dashboard.module.css";
import { useDashboardCollectionsMetrics } from "../../hooks/controller/dashboard/useDashboardCollectionsMetrics";
import { useDashboardGraphics } from "../../hooks/controller/dashboard/useDashboardGraphics";
import { Users, MessageSquareText, TrendingUp, AlertTriangle, Clock, BarChart2, Megaphone, TrendingDown, HandCoins, CalendarCheck } from "lucide-react";

// ─── counter animation ───────────────────────────────────────────
function useCountUp(target: number, duration = 1100) {
  const [count, setCount] = useState(0);
  const raf = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    startRef.current = null;
    if (raf.current) cancelAnimationFrame(raf.current);
    if (target === 0) { setCount(0); return; }
    const animate = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      const p = Math.min((ts - startRef.current) / duration, 1);
      setCount(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf.current = requestAnimationFrame(animate);
    };
    raf.current = requestAnimationFrame(animate);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, duration]);

  return count;
}

// ─── KPI card ────────────────────────────────────────────────────
type KpiCardProps = {
  label: string; rawValue: number; suffix?: string;
  icon: React.ReactNode; isAlert?: boolean; isFloat?: boolean; isCurrency?: boolean; delay?: number;
  subLabel?: string; subValue?: string;
};
function KpiCard({ label, rawValue, suffix = "", icon, isAlert, isFloat, isCurrency, delay = 0, subLabel, subValue }: KpiCardProps) {
  const count = useCountUp(isFloat || isCurrency ? 0 : rawValue);
  const display = isCurrency
    ? rawValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
    : isFloat
      ? rawValue.toFixed(1).replace(".", ",")
      : count.toLocaleString("pt-BR");
  return (
    <div className={`${Style.kpiCard} ${isAlert ? Style.kpi_alert : ""}`} style={{ animationDelay: `${delay}ms` }}>
      <div className={`${Style.kpiIcon} ${isAlert ? Style.kpiIcon_alert : ""}`}>{icon}</div>
      <div className={Style.kpiTexts}>
        <span className={Style.kpiLabel}>{label}</span>
        <span className={`${Style.kpiValue} ${isAlert ? Style.kpiValue_alert : ""}`}>{display}{suffix}</span>
        {subLabel && subValue && (
          <span className={Style.kpiSub}>{subLabel}: {subValue}</span>
        )}
      </div>
    </div>
  );
}

// ─── tab config ──────────────────────────────────────────────────
type TabId = "inadimplencia" | "promessas" | "recuperacao" | "analise" | "disparos" | "campanhas";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "inadimplencia", label: "Inadimplência",       icon: <TrendingDown size={14} /> },
  { id: "promessas",     label: "Promessas",            icon: <HandCoins size={14} /> },
  { id: "recuperacao",   label: "Recuperação",          icon: <CalendarCheck size={14} /> },
  { id: "disparos",      label: "Disparos & Respostas",  icon: <BarChart2 size={14} /> },
  { id: "campanhas",     label: "Campanhas",            icon: <Megaphone size={14} /> },
  { id: "analise",       label: "Análise",              icon: <BarChart2 size={14} /> },
];

// ─── main component ───────────────────────────────────────────────
export default function Dashboard() {
  const { metrics } = useDashboardCollectionsMetrics();
  const { delinquencyRate } = useDashboardGraphics();
  const [activeTab, setActiveTab] = useState<TabId>("inadimplencia");

  return (
    <PageContainer className={Style.DashboardContainer}>
      <TitlePage title="Dashboard" subtitle="Visão geral em tempo real do sistema de cobrança" />

      {/* KPI cards */}
      <div className={Style.kpiGrid}>
        <KpiCard label="Inadimplência"      rawValue={delinquencyRate}                  icon={<Users size={17} />}             delay={0}   isFloat suffix="%" />
        <KpiCard label="Responderam"        rawValue={metrics.respondedAfterCharge30d} icon={<MessageSquareText size={17} />} delay={60}  />
        <KpiCard label="Retorno em Cobrança" rawValue={metrics.recoveredAmount}           icon={<TrendingUp size={17} />}        delay={120} isCurrency subLabel="Responderam e pagaram" subValue={`${metrics.chargedCustomers30d > 0 ? ((metrics.respondedAndPaid / metrics.chargedCustomers30d) * 100).toFixed(1).replace(".", ",") : "0,0"}%`} />
        <KpiCard label="Sem resposta +24h"  rawValue={metrics.noResponseOver24h}        icon={<AlertTriangle size={17} />}     delay={180} isAlert />
        <KpiCard label="Follow-ups Abertos" rawValue={metrics.openFollowups}            icon={<Clock size={17} />}             delay={240} />
      </div>

      {/* Tab bar */}
      <div className={Style.tabBar}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`${Style.tab} ${activeTab === tab.id ? Style.tabActive : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Charts area */}
      <div className={Style.chartsArea}>

        {activeTab === "inadimplencia" && (
          <div className={Style.grid2col}>
            <div className={Style.cell}><GraficoCobranca /></div>
            <div className={Style.cell}><GraficoFunil /></div>
          </div>
        )}

        {activeTab === "promessas" && (
          <div className={Style.grid2col}>
            <div className={Style.cell}><GraficoPromessas /></div>
            <div className={Style.cell}><GraficoPrevisao /></div>
          </div>
        )}

        {activeTab === "recuperacao" && (
          <div className={Style.grid2col}>
            <div className={Style.cell}><GraficoAging /></div>
            <div className={Style.cell}><GraficoConversao /></div>
          </div>
        )}

        {activeTab === "analise" && (
          <div className={Style.grid1col}>
            <div className={Style.cell}><GraficoPaymentProfile /></div>
          </div>
        )}

        {activeTab === "disparos" && (
          <div className={Style.grid2col}>
            <div className={Style.cell}><GraficoRelatorio /></div>
            <div className={Style.cell}><GraficoDisparo /></div>
          </div>
        )}

        {activeTab === "campanhas" && (
          <div className={Style.grid1col}>
            <div className={Style.cell}><GraficoCampanhas /></div>
          </div>
        )}

      </div>
    </PageContainer>
  );
}
