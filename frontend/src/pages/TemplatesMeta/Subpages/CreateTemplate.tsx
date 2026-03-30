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
    isSubmitting,
    previewBody,
    categoryOptions,
    isCategoriesError,
    categoryPlaceholder,
    ctaOptions,
    variableOptions,
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

          <div className={Style.formGroup}>
            <label>Nome do template*</label>
            <InputFields
              maxLength={512}
              className={Style.containerI1}
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder="Digite o nome do template"
            />
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
            varOptions={variableOptions}
            varOpen={varOpen}
            onOpen={() => setVarOpen(true)}
            onClose={() => setVarOpen(false)}
            setVariablesMap={setVariablesMap}
          />

          <div className={Style.rowCta}>
            <div className={Style.formGroupChamada}>
              <label className={Style.Titulosinputs}>Botões</label>
              <Dropdown
                label="Botões"
                placeholder="Selecione os botões"
                showFloatingLabel={false}
                searchable={false}
                options={ctaOptions}
                selected={ctas}
                multiple
                open={ctaOpen}
                onOpen={() => setCtaOpen(true)}
                onClose={() => setCtaOpen(false)}
                onChange={(values) => setCtas(values as SelectOption[])}
              />
              <span className={Style.helperText}>
                Escolha um ou os dois botões para seu template.
              </span>
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

                <p
                  className={`${Style.previewBody} ${
                    !body.trim() ? Style.previewText : ""
                  }`}
                >
                  {previewBody}
                </p>

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
          />
        </aside>
      </div>
    </PageContainer>
  );
}
