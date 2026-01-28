"use client";

// PrimeReact styles
import "primereact/resources/themes/lara-dark-indigo/theme.css";
import "primereact/resources/primereact.min.css";
import "primeicons/primeicons.css";
import "primeflex/primeflex.css";

import { useEffect, useState } from "react";
import Style from "../Styles/Create-template.module.css";

import {
  Dropdown,
  InputFields,
  PageContainer,
  TitlePage,
  UploadButton,
  PreviewBox,
  MyButton,
} from "../../../componente/Index";

/* =========================
   MOCKS
========================= */
const mediaOptions = [
  { id: "Nenhum", name: "Nenhum" },
  { id: "Localizacao", name: "Localização" },
  { id: "Video", name: "Vídeo" },
  { id: "Imagem", name: "Imagem" },
  { id: "Documento", name: "Documento" },
];

const categoryOptions = [
  { id: "Marketing", name: "Marketing" },
  { id: "Aviso", name: "Aviso" },
  { id: "Cobranca", name: "Cobrança" },
  { id: "Outros", name: "Outros" },
];

const ctaOptions = [
  { id: "Pix", name: "Pagar agora" },
  { id: "Pdf", name: "Copy offer code" },
  { id: "Link", name: "Ver todas opções" },
];

const varOptions = [
  { id: "Nome_cliente", name: "Nome_cliente" },
  { id: "Valor_fatura", name: "Valor_fatura" },
  { id: "Data_vencimento", name: "Data_vencimento" },
];

export default function CreateTemplate() {
  const [mediaOpen, setMediaOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [ctaOpen, setCtaOpen] = useState(false);
  const [varOpen, setVarOpen] = useState(false);

  const [media, setMedia] = useState<any>(null);
  const [category, setCategory] = useState<any>(null);
  const [ctas, setCtas] = useState<any[]>([]);
  const [Var, setVar] = useState<any>(null);

  const [header, setHeader] = useState("");
  const [corpo, setCorpo] = useState("");
  const [rodape, setRodape] = useState("");

  const isMediaNone = media?.id === "Nenhum" || media === null;

  useEffect(() => {
    if (!isMediaNone);
  }, [isMediaNone]);

  /* =========================
     PREVIEW
  ========================= */
  const whatsappPreview = (
    <div className={Style.previewWhatsapp}>
      {!isMediaNone && (
        <div className={Style.previewMedia}>
          <span className={Style.previewMediaIcon}>📄</span>
        </div>
      )}

      {header && <p className={Style.previewHeader}>{header}</p>}

      <p className={Style.previewBody}>
        {corpo || "Veja neste campo, a prévia do corpo de seu disparo"}
      </p>

      {rodape && <p className={Style.previewFooter}>{rodape}</p>}

      {ctas.length > 0 && (
        <div className={Style.previewActions}>
          {ctas.map((cta, index) => (
            <div
              key={cta.id}
              className={
                index === 0
                  ? Style.previewActionPrimary
                  : Style.previewActionSecondary
              }
            >
              {cta.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <PageContainer className={Style.pageContainer}>
      <TitlePage
        title="Criar templates"
        className={Style.CreateTemplateTitle}
      />

      <div className={Style.contentGrid}>
        <div className={Style.formCard}>
          <h4 className={Style.sectionTitle}>Dados do Template</h4>

          <div className={Style.formGroup}>
            <label>Nome*</label>
            <InputFields className={Style.containerI1} />
          </div>

          <div className={Style.formRow}>
            <div className={Style.formGroup}>
              <label className={Style.Titulosinputs}>
                Amostra de mídia (Opcional)
              </label>
              <Dropdown
                label="Amostra de mídia"
                options={mediaOptions}
                value={media}
                open={mediaOpen}
                onOpen={() => setMediaOpen(true)}
                onClose={() => setMediaOpen(false)}
                onChange={setMedia}
              />
            </div>

            <div className={Style.formGroup}>
              <label className={Style.Titulosinputs}>Categoria*</label>
              <Dropdown
                label="Categoria"
                options={categoryOptions}
                value={category}
                open={categoryOpen}
                onOpen={() => setCategoryOpen(true)}
                onClose={() => setCategoryOpen(false)}
                onChange={setCategory}
              />
            </div>
          </div>

          {/* ===== UPLOAD (SÓ SE MÍDIA ≠ NENHUM) ===== */}
          {!isMediaNone && (
            <div className={Style.uploadWrapper}>
              <label className={Style.UploadButton1}>Upload arquivos</label>
              <div className={Style.UploadButtonT1}>
                <UploadButton
                  onUpload={(file) => console.log(file)}
                  className={Style.ButtnUpload}
                />
              </div>
            </div>
          )}

          <div className={Style.bordaformGroup}>
            <div className={Style.formGroup}>
              <label>Corpo*</label>
              <div className={Style.actions}>
                <InputFields className={Style.containerI1} value={corpo} onChange={(e: any) => setCorpo(e.target.value)}/>
                
                <label className={Style.Titulosinputs}>Variáveis*</label>
                
                <Dropdown
                  label="Variáveis"
                  options={varOptions}
                  value={Var}
                  open={varOpen}
                  onOpen={() => setVarOpen(true)}
                  onClose={() => setVarOpen(false)}
                  onChange={setVar}
                  className={Style.dropdownCustom}
                 />
              </div>
            </div>

            <div className={Style.row2}>
              <div className={Style.formGroup}>
                <label>Cabeçalho (Opcional)</label>
                <InputFields
                  className={Style.containerI1}
                  value={header}
                  onChange={(e: any) => setHeader(e.target.value)}
                  disabled={!isMediaNone}
                  placeholder={
                    isMediaNone
                      ? "Digite o cabeçalho"
                      : "Selecione (Nenhum) para usar cabeçalho"
                  }
                />
              </div>

              <div className={Style.formGroup}>
                <label>Rodapé (Opcional)</label>
                <InputFields
                  className={Style.containerI1}
                  value={rodape}
                  onChange={(e: any) => setRodape(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className={Style.formGroupChamada}>
            <Dropdown
              label="Chamada para ação (Opcional)"
              options={ctaOptions}
              selected={ctas}
              multiple
              open={ctaOpen}
              onOpen={() => setCtaOpen(true)}
              onClose={() => setCtaOpen(false)}
              onChange={(vals) => setCtas(vals as any[])}
            />
          </div>
        </div>

        {/* ===== LADO DIREITO ===== */}
        <div className={Style.sideColumn}>
          <div className={Style.previewCard1}>
            <h4 className={Style.previewTitle1}>Prévia do modelo</h4>

            <PreviewBox classname={Style.conteudoTitle}>
              {whatsappPreview}
            </PreviewBox>
          </div>

          <div className={Style.variablesCard}>
            <h4 className={Style.variablesTitle}>Amostras de variáveis</h4>

            <div className={Style.variableItem}>
              <span className={Style.variableKey}>Nome_client</span>
              <InputFields></InputFields>
            </div>

            <div className={Style.variableItem}>
              <span className={Style.variableKey}>Valor_fatura</span>
              <InputFields></InputFields>
            </div>

            <div className={Style.variableItem}>
              <span className={Style.variableKey}>Data_vencimento</span>
              <InputFields></InputFields>
            </div>
          </div>

          {/* ===== AÇÕES ===== */}

          <div className={Style.actions}>
            <MyButton text="Voltar" className={Style.btnCancel} />
            <MyButton text="Salvar" className={Style.btnSave} />
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
