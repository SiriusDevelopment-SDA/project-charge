"use client";

//PrimeReact styles
import "primereact/resources/themes/lara-dark-indigo/theme.css";
import { toast } from "react-toastify";
import "primereact/resources/primereact.min.css";
import "primeicons/primeicons.css";
import "primeflex/primeflex.css";
import { useState, type ChangeEvent } from "react";
import Style from "../Styles/Create-template.module.css";
import { TemplateBody } from "../../../componente/Index";
import { AmostraVariaveis } from "../../../componente/Index";
import { Api } from "../../../services/api";
import { AuthService } from "../../../services/auth/auth.service";
import { getErrorMessage } from "../../../utils/error";

import {
  Dropdown,
  InputFields,
  PageContainer,
  TitlePage,
  UploadButton,
  PreviewBox,
  MyButton,
} from "../../../componente/Index";
import { useLocation, useNavigate } from "react-router-dom";

//Dados mockados

type SelectOption = {
  id: string;
  name: string;
};

//Mock amostra de mÃ­dia
const mediaOptions: SelectOption[] = [
  { id: "Nenhum", name: "Nenhum" },
  { id: "Localizacao", name: "LocalizaÃ§Ã£o" },
  { id: "Video", name: "VÃ­deo" },
  { id: "Imagem", name: "Imagem" },
  { id: "Documento", name: "Documento" },
];

//Mock categoria
const categoryOptions: SelectOption[] = [
  { id: "Marketing", name: "Marketing" },
  { id: "Aviso", name: "Aviso" },
  { id: "Cobranca", name: "CobranÃ§a" },
  { id: "Outros", name: "Outros" },
];

//Mock variÃ¡veis
const varOptions: SelectOption[] = [
  { id: "nome_cliente", name: "nome_cliente" },
  { id: "valor_fatura", name: "valor_fatura" },
  { id: "data_vencimento_fatura", name: "data_vencimento_fatura" },
  { id: "nome_atendente", name: "nome_atendente" },
  { id: "numero_contrato", name: "numero_contrato" },
  { id: "code_pix", name: "code_pix" },
  { id: "linha_digitavel_boleto", name: "linha_digitavel_boleto" },
  { id: "link_boleto_pdf", name: "link_boleto_pdf" },
];

//Mock chamada para aÃ§Ã£o
const ctaOptions: SelectOption[] = [
  { id: "Pix", name: "Pagar agora" },
  { id: "Pdf", name: "Copiar cÃ³digo" },
  { id: "Link", name: "Ver todas opÃ§Ãµes" },
];

{
  /*Exports*/
}
export default function CreateTemplate() {
  const [templateName, setTemplateName] = useState("");
  const [mediaOpen, setMediaOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [ctaOpen, setCtaOpen] = useState(false);
  const [varOpen, setVarOpen] = useState(false);
  const [media, setMedia] = useState<SelectOption | null>(null);
  const [category, setCategory] = useState<SelectOption | null>(null);
  const [ctas, setCtas] = useState<SelectOption[]>([]);
  const [varsSelected, setVarsSelected] = useState<SelectOption[]>([]);
  const [header, setHeader] = useState("");
  const [corpo, setCorpo] = useState("");
  const [rodape, setRodape] = useState("");
  const [variablesMap, setVariablesMap] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isMediaNone = media?.id === "Nenhum" || media === null;
  const navigate = useNavigate();
  const location = useLocation();

  const handleChangeMedia = (value: SelectOption | null) => {
    setMedia(value);
    const nextIsMediaNone = value?.id === "Nenhum" || value === null;
    if (!nextIsMediaNone) {
      setHeader("");
    }
  };

  const mapCategory = (value?: string) => {
    switch (value) {
      case "Marketing":
        return "MARKETING";
      case "Aviso":
      case "Cobranca":
      case "Outros":
      default:
        return "UTILITY";
    }
  };

  const mapMediaFormat = (value?: string) => {
    switch (value) {
      case "Imagem":
        return "IMAGE";
      case "Video":
        return "VIDEO";
      case "Documento":
        return "DOCUMENT";
      default:
        return "TEXT";
    }
  };

  const mapCtaType = (ctaId: string) => {
    if (ctaId === "Pdf") return "COPY_CODE";
    return "URL";
  };

  const extractOrderedVarsFromBody = (body: string, allowedVars: string[]) => {
    const found: string[] = [];
    const seen = new Set<string>();
    const regex = /\{\{([^}]+)\}\}/g;
    let match: RegExpExecArray | null = regex.exec(body);

    while (match) {
      const varName = String(match[1] ?? "").trim();
      if (
        varName &&
        allowedVars.includes(varName) &&
        !seen.has(varName)
      ) {
        seen.add(varName);
        found.push(varName);
      }
      match = regex.exec(body);
    }

    return found;
  };

  const toMetaIndexedBody = (body: string, orderedVars: string[]) => {
    return orderedVars.reduce((acc, varName, index) => {
      const placeholder = `{{${varName}}}`;
      const metaPlaceholder = `{{${index + 1}}}`;
      return acc.replaceAll(placeholder, metaPlaceholder);
    }, body);
  };

  const handleSaveTemplate = async () => {
    const normalizedName = templateName.trim();
    if (!normalizedName) {
      toast.error("Informe o nome do template.");
      return;
    }

    if (!category?.name) {
      toast.error("Selecione uma categoria.");
      return;
    }

    if (!corpo.trim()) {
      toast.error("Preencha o corpo do template.");
      return;
    }

    if (!varsSelected.length) {
      toast.error("Selecione ao menos uma variável.");
      return;
    }

    try {
      setIsSubmitting(true);
      const me = await AuthService.me();
      const selectedVarNames = varsSelected.map((item) => String(item.name));
      const orderedVars = extractOrderedVarsFromBody(corpo, selectedVarNames);

      if (!orderedVars.length) {
        toast.error("Inclua as variáveis no corpo do template para definir a ordem Meta.");
        return;
      }

      const bodyWithMetaOrder = toMetaIndexedBody(corpo.trim(), orderedVars);

      const components: Array<Record<string, unknown>> = [];
      if (isMediaNone) {
        if (header.trim()) {
          components.push({
            type: "HEADER",
            format: "TEXT",
            text: header.trim(),
          });
        }
      } else {
        components.push({
          type: "HEADER",
          format: mapMediaFormat(media?.name),
        });
      }

      components.push({
        type: "BODY",
        text: bodyWithMetaOrder,
      });

      if (rodape.trim()) {
        components.push({
          type: "FOOTER",
          text: rodape.trim(),
        });
      }

      if (ctas.length) {
        components.push({
          type: "BUTTONS",
          buttons: ctas.map((cta) => ({
            type: mapCtaType(String(cta.id)),
            text: String(cta.name),
          })),
        });
      }

      const variables = orderedVars.reduce<Record<string, string>>((acc, item, index) => {
        acc[String(index + 1)] = item;
        return acc;
      }, {});

      await Api.post("/templates/create", {
        companyId: me.company.id,
        name: normalizedName,
        language: "pt_BR",
        category: mapCategory(category.name),
        components,
        variables,
      });

      toast.success("Template criado com sucesso!");
      navigate(`/templates${location.search}`);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Erro ao criar template"));
    } finally {
      setIsSubmitting(false);
    }
  };
  {
    /*PrÃ©via jÃ¡ com substituiÃ§Ã£o*/
  }
  function renderPreview(text: string) {
    let result = text;
    Object.entries(variablesMap).forEach(([key, value]) => {
      result = result.replaceAll(`{{${key}}}`, value || `{{${key}}}`);
    });
    return result;
  }
  /*PrÃ©via de modelo*/

  const whatsappPreview = (
    <div className={Style.previewWhatsapp}>
      {!isMediaNone && (
        <div className={Style.previewMedia}>
          <span className={Style.previewMediaIcon}>ðŸ“„</span>
        </div>
      )}

      {header && <p className={Style.previewHeader}>{header}</p>}

      <p className={Style.previewBody}>
        {renderPreview(
          corpo || "Veja neste campo, a prÃ©via do corpo de seu disparo",
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
        subtitle="Monte e valide modelos de mensagem com variaveis dinamicas"
        className={Style.CreateTemplateTitle}
      />
      <div className={Style.contentGrid}>
        <div className={Style.formCard}>
          <h4 className={Style.sectionTitle}>Dados do Template</h4>

          {/*Nome*/}
          <div className={Style.formGroup}>
            <label>Nome*</label>
            <InputFields
              maxLength={512}
              className={Style.containerI1}
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
            />
          </div>

          {/*Amostra de mÃ­dia e categoria*/}
          <div className={Style.formRow}>
            {/*Amostra de mÃ­dia*/}
            <div className={Style.formGroup}>
              <label className={Style.Titulosinputs}>
                Amostra de mÃ­dia (Opcional)
              </label>
              <Dropdown
                className={Style.dropdown1}
                label="Amostra de mÃ­dia"
                options={mediaOptions}
                value={media}
                open={mediaOpen}
                onOpen={() => setMediaOpen(true)}
                onClose={() => setMediaOpen(false)}
                onChange={handleChangeMedia}
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
                  onUpload={() => undefined}
                  className={Style.ButtnUpload}
                />
              </div>
            </div>
          )}

          {/*corpo*/}

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

          {/* CabeÃ§alho e RodapÃ© */}
          <div className={Style.row2}>
            {/* CabeÃ§alho */}
            <div className={Style.formGroup}>
              <label>CabeÃ§alho (Opcional)</label>
                <InputFields
                  maxLength={60}
                  className={Style.containerI1}
                  value={header}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setHeader(event.target.value)
                  }
                  disabled={!isMediaNone}
                  placeholder={
                  isMediaNone
                    ? "Digite o cabeÃ§alho"
                    : "Selecione (Nenhum) para usar cabeÃ§alho"
                }
              />
            </div>

            {/* RodapÃ© */}
            <div className={Style.formGroup}>
              <label>RodapÃ© (Opcional)</label>
                <InputFields
                  maxLength={60}
                  className={Style.containerI1}
                  value={rodape}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setRodape(event.target.value)
                  }
                />
            </div>
          </div>

          {/* Chamada para aÃ§Ã£o */}

          <div className={Style.rowCta}>
            <div className={Style.formGroupChamada}>
              <Dropdown
                label="Chamada para aÃ§Ã£o (Opcional)"
                options={ctaOptions}
                selected={ctas}
                multiple
                open={ctaOpen}
                onOpen={() => setCtaOpen(true)}
                onClose={() => setCtaOpen(false)}
                onChange={(values) => setCtas(values as SelectOption[])}
              />
            </div>

            <div className={Style.actions}>
              <MyButton
                text="Voltar"
                className={Style.btnCancel}
                onClick={() => navigate(`/templates${location.search}`)}
              />
              <MyButton
                text={isSubmitting ? "Salvando..." : "Salvar"}
                className={Style.btnSave}
                disabled={isSubmitting}
                onClick={handleSaveTemplate}
              />
            </div>
          </div>
        </div>

        {/* <---------------------------LADO DIREITO DA PÃGINA ---------------------------> */}

        <div className={Style.sideColumn}>
          <div className={Style.previewCard1}>
            <PreviewBox classname={Style.conteudoTitle}>
              {whatsappPreview}
            </PreviewBox>
          </div>

          {/* Amostra de variÃ¡veis */}
          <AmostraVariaveis
            variablesMap={variablesMap}
            setVariablesMap={setVariablesMap}
          />
        </div>
      </div>
    </PageContainer>
  );
}


