import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import styles from './GraficoRelatorio.module.css';
import { useDashboardReturnRate } from '../../hooks/controller/dashboard/useDashboardReturnRate';

const GraficoRelatorio: React.FC = () => {
  const { returnRate } = useDashboardReturnRate();

  return (
    <div className={styles.container}>
      {/* Cabeçalho */}
      <div className={styles.header}>
        <h2 className={styles.title}>
          Retorno de disparo
        </h2>

        {/* Legenda Customizada */}
        <div className={styles.legend}>
          <div className={styles.legendItem}>
            <div className={`${styles.legendDot} ${styles.legendDotGold}`}></div>
            <span className={styles.legendText}>Disparo</span>
          </div>
          <div className={styles.legendItem}>
            <div className={`${styles.legendDot} ${styles.legendDotGreen}`}></div>
            <span className={styles.legendText}>Retorno</span>
          </div>
        </div>
      </div>

      {/* Área do Gráfico */}
      <div className={styles.chartArea}>
        <ResponsiveContainer>
          <AreaChart data={returnRate} margin={{ top: 10, right: 10, left: 15, bottom: 20 }}>
            <defs>
              {/* Gradiente Dourado (Disparo) */}
              <linearGradient id="colorDisparo" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ffd700" stopOpacity={0.5}/>
                <stop offset="100%" stopColor="#ffd700" stopOpacity={0}/>
              </linearGradient>
              
              {/* Gradiente Verde (Retorno) */}
              <linearGradient id="colorRetorno" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00ff88" stopOpacity={0.5}/>
                <stop offset="100%" stopColor="#00ff88" stopOpacity={0}/>
              </linearGradient>

              {/* Filtro de Brilho (Glow) para os pontos */}
              <filter id="pointGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feFlood floodColor="inherit" floodOpacity="0.8" result="color" />
                <feComposite in="color" in2="blur" operator="in" result="glow" />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            
            {/* Grid Horizontal */}
            <CartesianGrid 
              strokeDasharray="4 4" 
              vertical={false} 
              stroke="#333" 
              strokeOpacity={0.6}
            />
            
            {/* Eixo X - Meses */}
            <XAxis 
              dataKey="month" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: '#777', fontSize: 13 }}
              dy={15}
            />
            
            {/* Eixo Y - Valores Customizados */}
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#777', fontSize: 13 }}
              tickFormatter={(value) => `${value.toLocaleString()}`}
              dx={-10}
            />
            
            <Tooltip 
              cursor={{ stroke: '#444', strokeWidth: 1 }}
              contentStyle={{ 
                backgroundColor: 'rgba(15, 15, 15, 0.95)', 
                border: '1px solid #333', 
                borderRadius: '12px',
                color: '#fff',
                fontSize: '13px',
                boxShadow: '0 10px 20px rgba(0,0,0,0.5)'
              }}
            />
            
            {/* Área de Disparo (Dourada) - Renderizada primeiro para ficar atrás */}
            <Area
              type="monotone"
              dataKey="disparo"
              stroke="#ffd700"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#colorDisparo)"
              dot={{ r: 5, fill: '#ffd700', strokeWidth: 0, filter: 'url(#pointGlow)' }}
              activeDot={{ r: 7, strokeWidth: 0 }}
              animationDuration={1500}
            />
            
            {/* Área de Retorno (Verde) - Renderizada depois para ficar na frente */}
            <Area
              type="monotone"
              dataKey="retorno"
              stroke="#00ff88"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#colorRetorno)"
              dot={{ r: 5, fill: '#00ff88', strokeWidth: 0, filter: 'url(#pointGlow)' }}
              activeDot={{ r: 7, strokeWidth: 0 }}
              animationDuration={2000}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default GraficoRelatorio;
