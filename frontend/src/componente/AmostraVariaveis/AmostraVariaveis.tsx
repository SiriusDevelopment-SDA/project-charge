"use client";


import { InputFields } from "../Index";
import Style from "../../pages/TemplatesMeta/Styles/Create-template.module.css";
import type { propAmostras } from "../../types";



const AmostraVariaveis = ({variablesMap, setVariablesMap}:propAmostras) => {
  const renderPreview = (text: string) => {
    let result = text;
    Object.entries(variablesMap).forEach(([key, value]) => {
      result = result.replaceAll(`{{${key}}}`, value || `{{${key}}}`);
    });
    return result;
  };

  return (
    <div className={Style.variablesCard}>
      <h4 className={Style.variablesTitle}>Amostras de variáveis</h4>

      {Object.keys(variablesMap).map((key: any) => (
        <div key={key} className={Style.variableItem}>
          <span className={Style.variableKey}>{key}</span>

          <InputFields
            value={variablesMap[key]}
            onChange={(e: any) =>
              setVariablesMap((prev) => ({
                ...prev,
                [key]: e.target.value,
              }))
            }
          />
        </div>
      ))}

      {/* chama o renderPreview */}
      <div className={Style.previewText}>
        {renderPreview("Selecione uma Variável em 'Variáveis'")}
      </div>
    </div>
  );
};


export default AmostraVariaveis;