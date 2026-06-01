import type { Category } from "../../../types";
import {
  AmostraVariaveis,
  Dropdown,
  InputFields,
  MyButton,
  PageContainer,
  PreviewBox,
  TemplateBody,
  TitlePage,
} from "../../../componente/Index";
import { useCreateTemplatePageController } from "../../../hooks/controller/templates/useCreateTemplatePageController";
import Style from "../Styles/Create-template.module.css";

type SelectOption = {
  id: string;
  name: string;
};

export default function CreateTemplate() {
  const {
    templateName,
    setTemplateName,
    categoryOpen,
    setCategoryOpen,
    ctaOpen,
    setCtaOpen,
    varOpen,
    setVarOpen,
    selectedCategory,
    setSelectedCategory,
    ctas,
    setCtas,
    varsSelected,
    setVarsSelected,
    header,
    setHeader,
    body,
    setBody,
    footer,
    setFooter,
    variablesMap,
    setVariablesMap,
    previewBody,
    isSubmitting,
    templateNameError,
    categoryError,
    bodyError,
    ctasError,
    sampleFieldErrors,
    categoryOptions,
    isCategoriesError,
    categoryPlaceholder,
    ctaOptions,
    variableOptions,
    variableLabels,
    validBodyVariables,
    invalidBodyVariables,
    handleBack,
    handleSaveTemplate,
  } = useCreateTemplatePageController();

  return (
    <PageContainer className={Style.pageContainer}>
      <TitlePage
        title="Criar template"
        subtitle="Monte e valide modelos de mensagem com variáveis dinâmicas."
        className={Style.CreateTemplateTitle}
      />

      <div className={Style.contentGrid}>
        <section className={Style.formCard}>
          <h4 className={Style.sectionTitle}>Dados do template</h4>

          <div className={Style.row2}>
            <div className={Style.formGroup}>
              <label>Nome do template*</label>
              <InputFields
                maxLength={512}
                className={Style.containerI1}
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                placeholder="Digite o nome do template"
              />
              {templateNameError && (
                <span className={Style.errorText}>{templateNameError}</span>
              )}
            </div>

            <div className={Style.formGroup}>
              <label className={Style.Titulosinputs}>Categoria*</label>
              <Dropdown
                className={Style.dropdown1}
                label="Categoria"
                placeholder={categoryPlaceholder}
                showFloatingLabel={false}
                options={categoryOptions}
                value={selectedCategory}
                open={categoryOpen}
                onOpen={() => setCategoryOpen(true)}
                onClose={() => setCategoryOpen(false)}
                onChange={(value) => setSelectedCategory(value as Category)}
              />
              {isCategoriesError && (
                <span className={Style.errorText}>
                  Não foi possível carregar as categorias cadastradas.
                </span>
              )}
              {!isCategoriesError && categoryError && (
                <span className={Style.errorText}>{categoryError}</span>
              )}
            </div>
          </div>

          <div className={Style.row2}>
            <div className={Style.formGroup}>
              <label>Cabeçalho</label>
              <InputFields
                maxLength={60}
                className={Style.containerI1}
                value={header}
                onChange={(event) => setHeader(event.target.value)}
                placeholder="Digite o cabeçalho fixo"
              />
            </div>

            <div className={Style.formGroup}>
              <label>Rodapé</label>
              <InputFields
                maxLength={60}
                className={Style.containerI1}
                value={footer}
                onChange={(event) => setFooter(event.target.value)}
                placeholder="Digite o rodapé"
              />
            </div>
          </div>

          <TemplateBody
            containerClassName={Style.bordaformGroup}
            textareaClassName={Style.textarea}
            labelClassName={Style.Titulosinputs}
            corpo={body}
            setCorpo={setBody}
            varsSelected={varsSelected}
            setVarsSelected={setVarsSelected}
            detectedValidCount={validBodyVariables.length}
            invalidVariables={invalidBodyVariables}
            varOptions={variableOptions}
            varOpen={varOpen}
            onOpen={() => setVarOpen(true)}
            onClose={() => setVarOpen(false)}
            setVariablesMap={setVariablesMap}
            bodyError={bodyError}
          />

          <div className={Style.rowCta}>
            <div className={Style.formGroupChamada}>
              <label className={Style.Titulosinputs}>Botões</label>
              <Dropdown
                label="Botões"
                placeholder="Selecione um botão"
                showFloatingLabel={false}
                searchable={false}
                options={ctaOptions}
                selected={ctas}
                multiple
                open={ctaOpen}
                onOpen={() => setCtaOpen(true)}
                onClose={() => setCtaOpen(false)}
                onChange={(values) => {
                  const nextValues = values as SelectOption[];
                  setCtas(
                    nextValues.length > 1
                      ? [nextValues[nextValues.length - 1]]
                      : nextValues,
                  );
                }}
              />
              <span className={Style.helperText}>
                Escolha um botão para seu template.
              </span>
              {ctasError && <span className={Style.errorText}>{ctasError}</span>}
            </div>

            <div className={Style.actions}>
              <MyButton
                text="Voltar"
                className={Style.btnCancel}
                onClick={handleBack}
                disabled={isSubmitting}
              />
              <MyButton
                text={isSubmitting ? "Salvando..." : "Salvar"}
                className={Style.btnSave}
                disabled={isSubmitting || categoryOptions.length === 0}
                onClick={handleSaveTemplate}
              />
            </div>
          </div>
        </section>

        <aside className={Style.sideColumn}>
          <div className={Style.previewCard1}>
            <PreviewBox classname={Style.previewSection}>
              <div className={Style.previewWhatsapp}>
                {header && <p className={Style.previewHeader}>{header}</p>}

                <div
                  className={`${Style.previewBody} ${
                    !body.trim() ? Style.previewText : ""
                  }`}
                >
                  {previewBody || "Veja aqui a previa do corpo do seu template."}
                </div>

                {footer && <p className={Style.previewFooter}>{footer}</p>}

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
            </PreviewBox>
          </div>

          <AmostraVariaveis
            variablesMap={variablesMap}
            setVariablesMap={setVariablesMap}
            variableLabels={variableLabels}
            sampleFieldErrors={sampleFieldErrors}
          />
        </aside>
      </div>
    </PageContainer>
  );
}
