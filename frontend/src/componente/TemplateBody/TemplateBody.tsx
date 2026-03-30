"use client";

import { Dropdown } from "../Index";
import Style from "../../pages/TemplatesMeta/Styles/Create-template.module.css";

type VarOption = {
  id: string;
  name: string;
};

type Props = {
  containerClassName?: string;
  textareaClassName?: string;
  labelClassName?: string;
  corpo: string;
  setCorpo: React.Dispatch<React.SetStateAction<string>>;
  varsSelected: VarOption[];
  setVarsSelected: React.Dispatch<React.SetStateAction<VarOption[]>>;
  varOptions: VarOption[];
  varOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  setVariablesMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
};

export function TemplateBody({
  containerClassName,
  textareaClassName,
  labelClassName,
  corpo,
  setCorpo,
  varsSelected,
  setVarsSelected,
  varOptions,
  varOpen,
  onOpen,
  onClose,
  setVariablesMap,
}: Props) {
  function insertVariable(varName: string) {
    setCorpo((prev) => prev + ` {{${varName}}}`);
    setVariablesMap((prev) => {
      if (prev[varName] !== undefined) return prev;
      return { ...prev, [varName]: "" };
    });
  }

  return (
    <div className={containerClassName}>
      <div>
        <label className={labelClassName}>Corpo*</label>
        <textarea
          className={textareaClassName}
          value={corpo}
          onChange={(event) => setCorpo(event.target.value)}
          maxLength={1024}
        />
      </div>

      <div className={Style.variablesBlock}>
        <label className={labelClassName}>Variáveis*</label>

        <Dropdown
          label="Variáveis"
          placeholder="Selecione as variáveis"
          showFloatingLabel={false}
          options={varOptions}
          selected={varsSelected}
          multiple
          open={varOpen}
          onOpen={onOpen}
          onClose={onClose}
          onChange={(vals) => {
            const next = vals as VarOption[];

            const removed = varsSelected.filter(
              (old) => !next.some((item) => item.id === old.id),
            );

            if (removed.length > 0) {
              setCorpo((prev) => {
                let text = prev;

                removed.forEach((removedVariable) => {
                  text = text.replace(
                    new RegExp(`{{${removedVariable.name}}}`, "g"),
                    "",
                  );
                });

                return text.replace(/\s{2,}/g, " ").trim();
              });

              setVariablesMap((prev) => {
                const copy = { ...prev };
                removed.forEach((removedVariable) => delete copy[removedVariable.name]);
                return copy;
              });
            } else {
              const last = next[next.length - 1];

              if (last?.name) {
                insertVariable(last.name);
              }
            }

            setVarsSelected(next);
          }}
        />
      </div>
    </div>
  );
}
