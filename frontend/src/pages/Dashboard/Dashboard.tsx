import { PageContainer, BaseCard, Metricas, GraficoCobranca, GraficoDisparo, GraficoRelatorio, GraficoCampanhas } from '../../componente/Index';
import Style from "./Styles/Dashboard.module.css";

// icons
import { CircleAlert, MessageSquareText, Flag  } from 'lucide-react';

export default function Dashboard() {
    
    // Dados de exemplo para as métricas
    const mockData = {
        totalCobrancas: "145.850,00",
        clientesInadimplentes: "23",
        campanhasAtivas: "8",
        mensagensEnviadas: "1.247"
    };    

    return (
        <PageContainer className={Style.DashboardContainer}>
            <div className={Style.cardsContainer}>
                <BaseCard classname={Style.cardMetricas}>
                    <Metricas
                        chave="Total de Clientes"
                        valor={mockData.totalCobrancas}
                        classname={Style.contentMetricas}
                        
                    />
                </BaseCard>
                
                <BaseCard classname={Style.cardMetricas}>
                    <Metricas
                        chave="Clientes Inadimplentes"
                        valor={mockData.clientesInadimplentes}
                        classname={Style.contentMetricas}
                        icon={<CircleAlert  size={22}/>}
                    />
                </BaseCard>
                
                <BaseCard classname={Style.cardMetricas}>
                    <Metricas
                        chave="Campanhas Ativas"
                        valor={mockData.campanhasAtivas}
                        classname={Style.contentMetricas}
                        icon={<Flag size={22}/>}
                    />
                </BaseCard>
               
                <BaseCard classname={Style.cardMetricas}>
                    <Metricas
                        chave="Total de Mensagens Enviadas"
                        valor={mockData.mensagensEnviadas}
                        classname={Style.contentMetricas}
                        icon={<MessageSquareText size={22}/>}
                    />
                </BaseCard>
            </div>

            <div className={Style.graficosContainer}>
                <div className={Style.grafico1}><GraficoCobranca/></div>
                <div className={Style.grafico2}><GraficoDisparo/></div>
                <div className={Style.grafico3}><GraficoRelatorio/></div>
                <div className={Style.grafico4}><GraficoCampanhas/></div>
            </div>
        </PageContainer>
    );
}