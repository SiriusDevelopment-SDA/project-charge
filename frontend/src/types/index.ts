// IMPORT TYPE INPUTS

import type React from "react";

export type MyInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?:string;

};

export type Template = {
  id: number;
  nome: string;
  conteudo: string;
  categoria?: string;
};

export type propTemplate = {
  setOpenState: React.Dispatch<React.SetStateAction<boolean>>;
  open: boolean;
  FilterButtonProp: true | false;
};