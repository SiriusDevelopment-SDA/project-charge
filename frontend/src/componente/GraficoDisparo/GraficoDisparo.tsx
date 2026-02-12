"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import styles from "./GraficoDisparo.module.css";

interface MonthlyData {
  month: string;
  value: number;
}

/**
 * Dados iniciais
 */
const initialData: MonthlyData[] = [
  { month: "Jan", value: 40 },
  { month: "Fev", value: 20 },
  { month: "Mar", value: 35 },
  { month: "Abr", value: 30 },
  { month: "Mai", value: 38 },
  { month: "Jun", value: 50 },
  { month: "Jul", value: 32 },
  { month: "Ago", value: 40 },
  { month: "Set", value: 52 },
  { month: "Out", value: 48 },
  { month: "Nov", value: 53 },
  { month: "Dez", value: 75 },
];

const GraficoDisparo: React.FC = () => {
  const [data, setData] = useState<MonthlyData[]>(initialData);

  /**
   * Aqui você pode trocar por chamada real da API
   */
  const fetchData = async () => {
    try {
      // 🔥 Produção:
      // const response = await fetch("/api/dashboard/disparos");
      // const result = await response.json();
      // setData(result);

      // 🔥 Simulação para teste
      const updated = initialData.map(item => ({
        ...item,
        value: Math.floor(Math.random() * 80) + 10,
      }));

      setData(updated);
    } catch (error) {
      console.error("Erro ao atualizar gráfico de disparo:", error);
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      fetchData();
    }, 15000); // 15 segundos

    return () => clearInterval(interval);
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Disparo mensal</h2>

        <div className={styles.dateSelector}>
          Jan - Jun '22
          <svg
            width="10"
            height="6"
            viewBox="0 0 10 6"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M1 1L5 5L9 1"
              stroke="#d4af37"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      <div className={styles.chartArea}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 20 }}>
            <defs>
              <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ffd700" stopOpacity={1} />
                <stop offset="100%" stopColor="#b8860b" stopOpacity={1} />
              </linearGradient>

              <filter id="barGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feFlood floodColor="#ffd700" floodOpacity="0.4" result="color" />
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
              stroke="#333"
              strokeOpacity={0.6}
            />

            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#777", fontSize: 13 }}
              dy={15}
            />

            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#777", fontSize: 13 }}
              domain={[0, 80]}
              ticks={[10, 20, 30, 40, 50, 60]}
              dx={-5}
            />

            <Tooltip
              cursor={{ fill: "rgba(212, 175, 55, 0.05)" }}
              contentStyle={{
                backgroundColor: "#111",
                border: "1px solid #d4af37",
                borderRadius: "12px",
                color: "#d4af37",
                boxShadow: "0 10px 20px rgba(0,0,0,0.5)",
              }}
              itemStyle={{ color: "#ffd700" }}
            />

            <Bar
              dataKey="value"
              radius={[6, 6, 0, 0]}
              barSize={28}
              filter="url(#barGlow)"
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill="url(#barGradient)" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default GraficoDisparo;
