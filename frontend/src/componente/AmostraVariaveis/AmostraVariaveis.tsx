"use client";

import { InputFields } from "../Index";
import Style from "../../pages/TemplatesMeta/Styles/Create-template.module.css";
import type { propAmostras } from "../../types";

const AmostraVariaveis = ({ variablesMap, setVariablesMap }: propAmostras) => {
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
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setVariablesMap((prev) => ({
                  ...prev,
                  [key]: event.target.value,
                }))
              }
            />
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
