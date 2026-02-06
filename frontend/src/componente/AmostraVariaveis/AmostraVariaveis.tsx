"use client";

import { InputFields } from "../Index";
import Style from "../../pages/TemplatesMeta/Styles/Create-template.module.css";
import type { propAmostras } from "../../types";

const AmostraVariaveis = ({ variablesMap, setVariablesMap }: propAmostras) => {
  const renderPreview = (text: string) => {
    let result = text;
    Object.entries(variablesMap).forEach(([key, value]) => {
      result = result.replaceAll(`{{${key}}}`, value || `{{${key}}}`);
    });
    return result;
  };

  const hasVariables = Object.keys(variablesMap).length > 0;

  return (
    <div className={Style.variablesCard}>
      <h4 className={Style.variablesTitle}>Amostras de variáveis</h4>

      {hasVariables &&
        Object.keys(variablesMap).map((key) => (
          <div key={key} className={Style.variableItem}>
            <span className={Style.variableKey}>{key}</span>

            <InputFields
              value={variablesMap[key]}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setVariablesMap((prev) => ({
                  ...prev,
                  [key]: e.target.value,
                }))
              }
            />
          </div>
        ))}

      {/* Texto aparece somente quando NÃO existir nenhuma variável */}
      {!hasVariables && (
        <div className={Style.previewText}>
          Selecione uma Variável em 'Variáveis'
        </div>
      )}
    </div>
  );
};

export default AmostraVariaveis;
