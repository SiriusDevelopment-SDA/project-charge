"use client";

import { InputFields } from "../Index";
import Style from "../../pages/TemplatesMeta/Styles/Create-template.module.css";
import type { propAmostras } from "../../types";

const AmostraVariaveis = ({
  variablesMap,
  setVariablesMap,
  variableLabels,
  sampleFieldErrors,
}: propAmostras & {
  variableLabels?: Record<string, string>;
  sampleFieldErrors?: Record<string, string>;
}) => {
  const hasVariables = Object.keys(variablesMap).length > 0;

  return (
    <div className={Style.variablesCard}>
      <h4 className={Style.variablesTitle}>Amostras de variáveis</h4>

      {hasVariables &&
        Object.keys(variablesMap).map((key) => (
          <div key={key} className={Style.variableItem}>
            <span className={Style.variableKey}>{variableLabels?.[key] ?? key}</span>

            <div className={Style.variableValueWrap}>
              <InputFields
                value={variablesMap[key]}
                inputMode={
                  key === "data_vencimento_fatura"
                    ? "numeric"
                    : key === "valor_fatura"
                      ? "decimal"
                      : undefined
                }
                maxLength={key === "data_vencimento_fatura" ? 10 : undefined}
                placeholder={
                  key === "data_vencimento_fatura"
                    ? "DD/MM/AAAA"
                    : key === "valor_fatura"
                      ? "0,00"
                      : undefined
                }
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setVariablesMap((prev) => ({
                    ...prev,
                    [key]: event.target.value,
                  }))
                }
              />
              {sampleFieldErrors?.[key] && (
                <span className={Style.errorText}>{sampleFieldErrors[key]}</span>
              )}
            </div>
          </div>
        ))}

      {!hasVariables && (
        <div className={Style.previewText}>
          Selecione uma variável em &quot;Variáveis&quot;.
        </div>
      )}
    </div>
  );
};

export default AmostraVariaveis;
