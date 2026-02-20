// MODALCARD
import { DynamicModal, Pagination } from "../Index";
import { useCampaign } from "../../hooks/useCampaign";
import { useState } from "react";
// COMPONENTES
import { TemplateBalloonCard } from "../TemplateCard/TemplateCard";
import { toast } from "react-toastify";
// STYLES
import Style from "./ModalCardCampanhas.module.css";
// Agora recebe open e onClose para integração externa
export default function ModalCardCampanhas({ open, onClose }: { open: boolean, onClose: () => void }) {
    // Estados para controle do modal de confirmação e da campanha selecionada
    const [openConfirmCampanhaModal, setOpenConfirmCampanhaModal] = useState(false);
    const [campanhaSelecionada, setCampanhaSelecionada] = useState<any | null>(null);
    const { paginated, page, setPage, totalPages } = useCampaign();
    // Função para formatar datas no formato brasileiro
    function formatarData(data: string | undefined): string {
        if (!data) return "-";
        const d = new Date(data);
        if (isNaN(d.getTime())) return "-";
        return d.toLocaleDateString("pt-BR");
    }
    if (!open) return null;
    return (
        <>
            {/* ================= MODAL CAMPANHAS ================= */}
            <DynamicModal
                open
                type="modaltemplates"
                title="SELECIONE UMA CAMPANHA"
                description={
                    <div className={Style.modalTemplatesContent}>
                        <div className={Style.listaTemplates}>
                            {paginated.length === 0 ? (
                                <span>Nenhuma campanha encontrada.</span>
                            ) : (
                                paginated.map((campanha) => (
                                    <div
                                        key={campanha.id}
                                        className={Style.templateWrapper}
                                        onClick={() => {
                                            setCampanhaSelecionada(campanha);
                                            setOpenConfirmCampanhaModal(true);
                                        }}
                                    >
                                        {/* USANDO O TEMPLATE CARD PARA EXIBIR AS CAMPANHAS */}
                                        <TemplateBalloonCard
                                            title={campanha.name ?? ""}
                                            message={campanha.message ?? ""}
                                            category={
                                                typeof campanha.template === "string"
                                                    ? campanha.template
                                                    : campanha.template?.name ?? ""
                                            }
                                            showExpand={false}
                                        >
                                            {/* DETALHES DA CAMPANHA NO BALÃO EXPANDIDO */}
                                            <div className={Style.campanhaDetailsModal}>
                                                <div>
                                                    <strong>Início:</strong> {formatarData(campanha.startDate)}
                                                </div>
                                                <div>
                                                    <strong>Fim:</strong> {formatarData(campanha.endDate)}
                                                </div>
                                                <div>
                                                    <strong>Horário:</strong> {campanha.dispatchStartTime ?? "-"}
                                                </div>
                                                <div>
                                                    <strong>Tipo:</strong> {typeof campanha.category === "string" ? campanha.category : campanha.category?.name ?? ""}
                                                </div>
                                            </div>
                                        </TemplateBalloonCard>
                                    </div>
                                ))
                            )}
                        </div>
                        {/* PAGINAÇÃO SIMPLES */}
                        <Pagination
                            className={Style.Pagination}
                            page={page}
                            onPrev={() => setPage((p) => Math.max(p - 1, 1))}
                            onNext={() => setPage((p) => Math.min(p + 1, totalPages))}
                            disablePrev={page === 1}
                            disableNext={page === totalPages}
                        />
                    </div>
                }
                onClose={onClose}
                buttons={[]}
            />
            {/* MODAL DE CONFIRMAÇÃO */}
            {openConfirmCampanhaModal && (
                <DynamicModal
                    open
                    type="warning"
                    title="Confirmar campanha"
                    description={
                        <>
                            Deseja utilizar esta campanha para o disparo?
                            <br />
                            <strong>{campanhaSelecionada?.name}</strong>
                        </>
                    }
                    onClose={() => setOpenConfirmCampanhaModal(false)}
                    buttons={[
                        {
                            label: "Sim",
                            variant: "success",
                            onClick: () => {
                                setCampanhaSelecionada(campanhaSelecionada);
                                setOpenConfirmCampanhaModal(false);
                                onClose();
                                toast.success("Campanha disparada com sucesso (Implementar)!");
                            },
                        },
                        {
                            label: "Não",
                            variant: "danger",
                            onClick: () => setOpenConfirmCampanhaModal(false),
                        },
                    ]}
                />
            )}
        </>
    );
}