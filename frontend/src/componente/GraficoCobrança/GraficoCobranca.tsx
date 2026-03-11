"use client";

import { useContext, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import styles from "./GraficoCobranca.module.css";
import { DashboardContext } from "../../context/contextDashboard";

const GraficoCobranca: React.FC = () => {
  
  const { charges,  loading } = useContext(DashboardContext)!

  const ALL_MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  const data = useMemo(() => {
    const map = new Map(charges.map(c => [c.month, c]));
    return ALL_MONTHS.map(month => ({
      month,
      inadimplencia: map.get(month)?.default ?? 0,
      pagamentos: map.get(month)?.payments ?? 0,
    }));
  }, [charges])

  if(loading) if(loading) return <div className={styles.container}>Carregando...</div>

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Cobrança</h2>

        <div className={styles.legend}>
          <div className={styles.legendItem}>
            <span className={`${styles.legendText} ${styles.legendTextRed}`}>
              Inadimplência
            </span>
            <div className={`${styles.legendBox} ${styles.legendBoxRed}`}></div>
          </div>
          <div className={styles.legendItem}>
            <span className={`${styles.legendText} ${styles.legendTextYellow}`}>
              Pagamentos
            </span>
            <div className={`${styles.legendBox} ${styles.legendBoxYellow}`}></div>
          </div>
        </div>
      </div>

      <div className={styles.chartArea}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 5, right: 20, left: -10, bottom: 20 }}>
            <defs>
              <filter id="lineGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feFlood floodColor="inherit" floodOpacity="0.6" result="color" />
                <feComposite in="color" in2="blur" operator="in" result="glow" />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <CartesianGrid
              strokeDasharray="4 4"
              vertical={false}
              stroke="#444"
              strokeOpacity={0.5}
            />

            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#888", fontSize: 12 }}
              dy={15}
            />

            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#888", fontSize: 12 }}
              allowDecimals={false}
              dx={-10}
              domain={[0, (dataMax: number) => dataMax + 1]}
            />

            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(20, 20, 20, 0.9)",
                border: "1px solid #444",
                borderRadius: "8px",
                color: "#fff",
                fontSize: "12px",
              }}
              itemStyle={{ padding: "2px 0" }}
              cursor={{ stroke: "#555", strokeWidth: 1 }}
            />

            <Line
              type="monotone"
              dataKey="inadimplencia"
              stroke="#ff3b3b"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 6, fill: "#ff3b3b", stroke: "#000", strokeWidth: 2 }}
              filter="url(#lineGlow)"
              animationDuration={800}
            />

            <Line
              type="monotone"
              dataKey="pagamentos"
              stroke="#ffcc00"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 6, fill: "#ffcc00", stroke: "#000", strokeWidth: 2 }}
              filter="url(#lineGlow)"
              animationDuration={800}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default GraficoCobranca;
