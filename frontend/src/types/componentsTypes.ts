import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { Template } from "./templateApiTypes";
import type { Cliente } from "./clientApiTypes";

export type MyInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

export type TemplateBalloonCardProps = {
  title: string;
  message: string;
  category: string;
  onUse?: () => void;
  onDelete?: () => void;
};

export type PaginationProps = {
  className?: string;
  page: number;
  onPrev: () => void;
  onNext: () => void;
  disablePrev?: boolean;
  disableNext?: boolean;
};

export type PropsCardTemplates = {
  template: Template;
  isOpen: boolean;
  onToggle: (id: string) => void;
  setOpenModal: React.Dispatch<React.SetStateAction<boolean>>;
  onDelete: (template: Template) => void
};

export type propTemplate = {
  setOpenState: React.Dispatch<React.SetStateAction<boolean>>;
  open: boolean;
  FilterButtonProp: true | false;
  templates: Template[]
  setTemplateSelecionado: React.Dispatch<React.SetStateAction<Template>>;
  templateSelecionado: Template | undefined
};

export type Lead = {
  [key: string]: any;
  nome_cliente?: string;
}
export type PropsSelect = {
  children: ReactNode | string;
  className?: string;
  disabled?: boolean;
  value?: string[];
  setSelected: Dispatch<React.SetStateAction<Cliente[]>>;
  selected: Cliente[];
  setOpen?: Dispatch<React.SetStateAction<boolean>>;
  open?: boolean;
  clientes: Cliente[];
};

export type FilterButtonProps = {
  templates: Template[];
  selectedCategory?: string
  setSelectedCategory: React.Dispatch<SetStateAction<string>>
  onCategoryChange?: (categoria: string) => void;
};

export type propAmostras={
    variablesMap: Record<string, string>
    setVariablesMap: React.Dispatch<React.SetStateAction<Record<string, string>>>
}

export type UploadButtonProps = {
  onUpload: (file: File, rows?: Record<string, string>[]) => void;
  disabled?: boolean;
  className?: string;
};
