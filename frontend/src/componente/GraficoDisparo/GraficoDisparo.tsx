"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Dropdown } from "../Index";
import { usePollingChartData } from "../../hooks/components/usePollingChartData";
import styles from "./GraficoDisparo.module.css";

interface MonthlyData {
  month: string;
  value: number;
}

type PeriodOption = {
  id: string;
  name: string;
  months: string[];
};

const periods: PeriodOption[] = [
  { id: "jan-jun", name: "Jan - Jun", months: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun"] },
  { id: "jul-dez", name: "Jul - Dez", months: ["Jul", "Ago", "Set", "Out", "Nov", "Dez"] },
  {
    id: "ano-todo",
    name: "Ano todo",
    months: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"],
  },
];

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
  const [selectedPeriod, setSelectedPeriod] = useState(periods[0]);
  const [isPeriodDropdownOpen, setIsPeriodDropdownOpen] = useState(false);

  const generateData = useCallback(
    (base: MonthlyData[]) =>
      base.map((item) => ({
        ...item,
        value: Math.floor(Math.random() * 80) + 10,
      })),
    []
  );

  const { data } = usePollingChartData(initialData, generateData, 15000);

  const filteredData = useMemo(
    () => data.filter((item) => selectedPeriod.months.includes(item.month)),
    [data, selectedPeriod]
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Disparo mensal</h2>

        <Dropdown<PeriodOption>
          className={styles.dateSelector}
          label="Periodo"
          options={periods}
          value={selectedPeriod}
          placeholder="Selecionar"
          open={isPeriodDropdownOpen}
          onOpen={() => setIsPeriodDropdownOpen(true)}
          onClose={() => setIsPeriodDropdownOpen(false)}
          onChange={(value) => setSelectedPeriod(value as PeriodOption)}
        />
      </div>

      <div className={styles.chartArea}>
        <ResponsiveContainer>
          <BarChart
            data={filteredData}
            margin={{ top: 10, right: 10, left: -15, bottom: 20 }}
          >
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

            <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={28} filter="url(#barGlow)">
              {filteredData.map((_, index) => (
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
