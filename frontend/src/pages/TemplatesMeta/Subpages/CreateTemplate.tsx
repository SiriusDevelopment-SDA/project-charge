"use client";

//PrimeReact styles
import "primereact/resources/themes/lara-dark-indigo/theme.css";
import { toast } from "react-toastify";
import "primereact/resources/primereact.min.css";
import "primeicons/primeicons.css";
import "primeflex/primeflex.css";
import { useState } from "react";
import Style from "../Styles/Create-template.module.css";
import { TemplateBody } from "../../../componente/Index";
import { AmostraVariaveis } from "../../../componente/Index";

import {
  Dropdown,
  InputFields,
  PageContainer,
  TitlePage,
  UploadButton,
  PreviewBox,
  MyButton,
} from "../../../componente/Index";

//Dados mockados

//Mock amostra de mídia
const mediaOptions = [
  { id: "Nenhum", name: "Nenhum" },
  { id: "Localizacao", name: "Localização" },
  { id: "Video", name: "Vídeo" },
  { id: "Imagem", name: "Imagem" },
  { id: "Documento", name: "Documento" },
];

//Mock categoria
const categoryOptions = [
  { id: "Marketing", name: "Marketing" },
  { id: "Aviso", name: "Aviso" },
  { id: "Cobranca", name: "Cobrança" },
  { id: "Outros", name: "Outros" },
];

//Mock variáveis
const varOptions = [
  { id: "Nome_cliente", name: "Nome_cliente" },
  { id: "Valor_fatura", name: "Valor_fatura" },
  { id: "Data_vencimento", name: "Data_vencimento" },
];

//Mock chamada para ação
const ctaOptions = [
  { id: "Pix", name: "Pagar agora" },
  { id: "Pdf", name: "Copy offer code" },
  { id: "Link", name: "Ver todas opções" },
];

{
  /*Exports*/
}
export default function CreateTemplate() {
  const [mediaOpen, setMediaOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [ctaOpen, setCtaOpen] = useState(false);
  const [varOpen, setVarOpen] = useState(false);
  const [media, setMedia] = useState<any>(null);
  const [category, setCategory] = useState<any>(null);
  const [ctas, setCtas] = useState<any[]>([]);
  const [varsSelected, setVarsSelected] = useState<any[]>([]);
  const [header, setHeader] = useState("");
  const [corpo, setCorpo] = useState("");
  const [rodape, setRodape] = useState("");
  const [variablesMap, setVariablesMap] = useState<Record<string, string>>({});
  const isMediaNone = media?.id === "Nenhum" || media === null;

  if (!isMediaNone && header) setHeader("");
  {
    /*Prévia já com substituição*/
  }
  function renderPreview(text: string) {
    let result = text;
    Object.entries(variablesMap).forEach(([key, value]) => {
      result = result.replaceAll(`{{${key}}}`, value || `{{${key}}}`);
    });
    return result;
  }
  /*Prévia de modelo*/

  const whatsappPreview = (
    <div className={Style.previewWhatsapp}>
      {!isMediaNone && (
        <div className={Style.previewMedia}>
          <span className={Style.previewMediaIcon}>📄</span>
        </div>
      )}

      {header && <p className={Style.previewHeader}>{header}</p>}

      <p className={Style.previewBody}>
        {renderPreview(
          corpo || "Veja neste campo, a prévia do corpo de seu disparo",
        )}
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

          {/*Nome*/}
          <div className={Style.formGroup}>
            <label>Nome*</label>
            <InputFields maxLength={512} className={Style.containerI1} />
          </div>

          {/*Amostra de mídia e categoria*/}
          <div className={Style.formRow}>
            {/*Amostra de mídia*/}
            <div className={Style.formGroup}>
              <label className={Style.Titulosinputs}>
                Amostra de mídia (Opcional)
              </label>
              <Dropdown
                className={Style.dropdown1}
                label="Amostra de mídia"
                options={mediaOptions}
                value={media}
                open={mediaOpen}
                onOpen={() => setMediaOpen(true)}
                onClose={() => setMediaOpen(false)}
                onChange={setMedia}
              />
            </div>

            {/*Categoria*/}
            <div className={Style.formGroup}>
              <label className={Style.Titulosinputs}>Categoria*</label>
              <Dropdown
                className={Style.dropdown1}
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

          {/*Upload de arquivos*/}
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

          {/*corpo*/}
          <div className={Style.bordaformGroup}>
            <TemplateBody
              containerClassName={Style.bordaformGroup}
              textareaClassName={Style.textarea}
              labelClassName={Style.Titulosinputs}
              corpo={corpo}
              setCorpo={setCorpo}
              varsSelected={varsSelected}
              setVarsSelected={setVarsSelected}
              varOptions={varOptions}
              varOpen={varOpen}
              onOpen={() => setVarOpen(true)}
              onClose={() => setVarOpen(false)}
              setVariablesMap={setVariablesMap}
            />

            {/* Cabeçalho e Rodapé */}
            <div className={Style.row2}>
              {/* Cabeçalho */}
              <div className={Style.formGroup}>
                <label>Cabeçalho (Opcional)</label>
                <InputFields
                  maxLength={60}
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

              {/* Rodapé */}
              <div className={Style.formGroup}>
                <label>Rodapé (Opcional)</label>
                <InputFields
                  maxLength={60}
                  className={Style.containerI1}
                  value={rodape}
                  onChange={(e: any) => setRodape(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Chamada para ação */}
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

        {/* <---------------------------LADO DIREITO DA PÁGINA ---------------------------> */}

        <div className={Style.sideColumn}>
          <div className={Style.previewCard1}>
            <PreviewBox classname={Style.conteudoTitle}>
              {whatsappPreview}
            </PreviewBox>
          </div>

          {/* Amostra de variáveis */}
          <AmostraVariaveis
            variablesMap={variablesMap}
            setVariablesMap={setVariablesMap}
          />

          <div className={Style.actions}>
            <MyButton text="Voltar" className={Style.btnCancel} />
            <MyButton
              text="Salvar"
              className={Style.btnSave}
              onClick={() =>
                toast.success(
                  "Template criado com sucesso! Aguardando a validação do META, verifique o status na aba templates",
                )
              }
            />
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
