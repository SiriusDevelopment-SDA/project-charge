import { useCallback, useMemo, useState } from "react";
import { toast } from "react-toastify";
import type { Dispatch, SetStateAction } from "react";
import type { Lead, Template } from "../../../types";
import {
  getMissingTemplateVariables,
  getStoredAttendantName,
  getStoredCompanyName,
  setStoredAttendantName,
  setStoredCompanyName,
} from "../../../mappers/templateVars.mapper";

const MANUAL_FIELD_LABELS: Record<string, string> = {
  nome_cliente: "Nome do cliente",
  nome_atendente: "Nome do atendente",
  nome_empresa: "Nome da empresa",
  data_vencimento_fatura: "Data de vencimento da fatura",
  numero_contrato: "Numero do contrato",
  valor_fatura: "Valor da fatura",
  linha_digitavel_boleto: "Linha digitavel do boleto",
  link_boleto_pdf: "Link do boleto",
  code_pix: "Codigo PIX",
  codigo_qr: "Codigo QR",
  codigo_qr_code: "Codigo QR code",
  codigo_pix: "Codigo PIX",
};

type UseManualLeadDispatchControllerParams = {
  modoPage: "clientes" | "leads";
  selectedTemplate: Template | null;
  selectedLeads: Lead[];
  setSelectedLeads: Dispatch<SetStateAction<Lead[]>>;
  sendTemplate: (extraLeads?: Lead[]) => Promise<void>;
  onPreviewReady?: () => void;
};

type PendingManualLeadAction = "send" | "preview";

function buildInitialManualFieldValues(fields: string[]) {
  return Object.fromEntries(
    fields
      .filter(
        (fieldKey) =>
          fieldKey !== "nome_atendente" && fieldKey !== "nome_empresa",
      )
      .map((fieldKey) => [fieldKey, ""]),
  );
}

export function useManualLeadDispatchController({
  modoPage,
  selectedTemplate,
  selectedLeads,
  setSelectedLeads,
  sendTemplate,
  onPreviewReady,
}: UseManualLeadDispatchControllerParams) {
  const [whatsappValue, setWhatsappValue] = useState("");
  const [openManualLeadModal, setOpenManualLeadModal] = useState(false);
  const [attendantName, setAttendantName] = useState(getStoredAttendantName());
  const [companyName, setCompanyName] = useState(getStoredCompanyName());
  const [pendingExtraLeads, setPendingExtraLeads] = useState<Lead[]>([]);
  const [pendingManualLeadFields, setPendingManualLeadFields] = useState<string[]>([]);
  const [manualLeadFieldValues, setManualLeadFieldValues] = useState<Record<string, string>>({});
  const [pendingManualLeadAction, setPendingManualLeadAction] =
    useState<PendingManualLeadAction>("send");

  const hasSpreadsheetLeads = useMemo(
    () => selectedLeads.some((lead) => lead.inputSource === "spreadsheet"),
    [selectedLeads],
  );
  const hasManualLeads = useMemo(
    () => selectedLeads.some((lead) => lead.inputSource === "manual"),
    [selectedLeads],
  );
  const hasTypedWhatsapp = whatsappValue.trim().length > 0;
  const shouldDisableLeadWhatsappInput =
    modoPage === "leads" && hasSpreadsheetLeads;
  const shouldDisableLeadUpload =
    modoPage === "leads" && (hasManualLeads || hasTypedWhatsapp);

  const resetPendingManualLeadState = useCallback(() => {
    setPendingExtraLeads([]);
    setPendingManualLeadFields([]);
    setManualLeadFieldValues({});
    setPendingManualLeadAction("send");
  }, []);

  const clearStoredManualLeads = useCallback(() => {
    setSelectedLeads((prev) =>
      prev.filter((lead) => lead.inputSource !== "manual"),
    );
    resetPendingManualLeadState();
  }, [resetPendingManualLeadState, setSelectedLeads]);

  const closeManualLeadModal = useCallback(() => {
    setOpenManualLeadModal(false);
    resetPendingManualLeadState();
  }, [resetPendingManualLeadState]);

  const clearLeadSelection = useCallback(() => {
    setSelectedLeads([]);
    setWhatsappValue("");
    resetPendingManualLeadState();
  }, [resetPendingManualLeadState, setSelectedLeads]);

  const handleWhatsappInputChange = useCallback(
    (value: string) => {
      if (modoPage === "leads" && hasManualLeads) {
        clearStoredManualLeads();
      }

      setWhatsappValue(value);
    },
    [clearStoredManualLeads, hasManualLeads, modoPage],
  );

  const getManualFieldLabel = useCallback((fieldKey: string) => {
    return (
      MANUAL_FIELD_LABELS[fieldKey] ??
      fieldKey
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
    );
  }, []);

  const appendManualLeads = useCallback(
    (leadsToAppend: Lead[]) => {
      setSelectedLeads((prev) => {
        const map = new Map(
          prev.map((lead) => [String(lead.whatsapp ?? "").trim(), lead]),
        );

        leadsToAppend.forEach((lead) => {
          const whatsapp = String(lead.whatsapp ?? "").trim();
          if (!whatsapp) return;

          map.set(whatsapp, { ...map.get(whatsapp), ...lead });
        });

        return Array.from(map.values());
      });
    },
    [setSelectedLeads],
  );

  const openPendingManualLeadModal = useCallback(
    (leads: Lead[], fields: string[], action: PendingManualLeadAction) => {
      setPendingExtraLeads(leads);
      setPendingManualLeadFields(fields);
      setPendingManualLeadAction(action);
      setAttendantName(getStoredAttendantName());
      setCompanyName(getStoredCompanyName());
      setManualLeadFieldValues(buildInitialManualFieldValues(fields));
      setOpenManualLeadModal(true);
    },
    [],
  );

  const triggerPreviewReady = useCallback(() => {
    if (!onPreviewReady) return;

    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => onPreviewReady());
      return;
    }

    onPreviewReady();
  }, [onPreviewReady]);

  const prepareDispatchPreview = useCallback(() => {
    if (modoPage !== "leads" || !whatsappValue.trim()) {
      triggerPreviewReady();
      return;
    }

    if (hasSpreadsheetLeads) {
      toast.warning(
        "Escolha apenas uma fonte para leads: planilha ou numero manual. Limpe a lista atual para trocar.",
      );
      return;
    }

    const digits = whatsappValue.replace(/\D/g, "");
    if (digits.length < 12) {
      toast.warning("Numero de WhatsApp invalido. Use o padrao 55DDNUMERO.");
      return;
    }

    const exists = selectedLeads.some(
      (lead) => String(lead.whatsapp ?? "").replace(/\D/g, "") === digits,
    );

    if (!exists) {
      const extraLeads = [{ whatsapp: digits, inputSource: "manual" as const }];

      if (selectedTemplate) {
        const missingFields = getMissingTemplateVariables(selectedTemplate, extraLeads[0]);

        if (missingFields.length > 0) {
          openPendingManualLeadModal(extraLeads, missingFields, "preview");
          return;
        }
      }

      appendManualLeads(extraLeads);
      setWhatsappValue("");
    }

    triggerPreviewReady();
  }, [
    appendManualLeads,
    hasSpreadsheetLeads,
    modoPage,
    openPendingManualLeadModal,
    selectedLeads,
    selectedTemplate,
    triggerPreviewReady,
    whatsappValue,
  ]);

  const submitDispatch = useCallback(async () => {
    let extraLeads: Lead[] = [];

    if (modoPage === "leads" && whatsappValue.trim()) {
      if (hasSpreadsheetLeads) {
        toast.warning(
          "Escolha apenas uma fonte para leads: planilha ou numero manual. Limpe a lista atual para trocar.",
        );
        return;
      }

      const digits = whatsappValue.replace(/\D/g, "");
      if (digits.length < 12) {
        toast.warning("Numero de WhatsApp invalido. Use o padrao 55DDNUMERO.");
        return;
      }

      const exists = selectedLeads.some(
        (lead) => String(lead.whatsapp ?? "").replace(/\D/g, "") === digits,
      );

      if (!exists) {
        extraLeads = [{ whatsapp: digits, inputSource: "manual" }];

        if (selectedTemplate) {
          const missingFields = getMissingTemplateVariables(
            selectedTemplate,
            extraLeads[0],
          );

          if (missingFields.length > 0) {
            openPendingManualLeadModal(extraLeads, missingFields, "send");
            return;
          }
        }

        appendManualLeads(extraLeads);
        setWhatsappValue("");
      }
    }

    await sendTemplate(extraLeads);
  }, [
    appendManualLeads,
    hasSpreadsheetLeads,
    modoPage,
    openPendingManualLeadModal,
    selectedLeads,
    selectedTemplate,
    sendTemplate,
    whatsappValue,
  ]);

  const updateManualLeadFieldValue = useCallback((fieldKey: string, value: string) => {
    setManualLeadFieldValues((prev) => ({
      ...prev,
      [fieldKey]: value,
    }));
  }, []);

  const confirmManualLeadDispatch = useCallback(async () => {
    const resolvedFieldValues = pendingManualLeadFields.reduce<Record<string, string>>(
      (acc, fieldKey) => {
        if (fieldKey === "nome_atendente") {
          acc[fieldKey] = attendantName.trim();
          return acc;
        }

        if (fieldKey === "nome_empresa") {
          acc[fieldKey] = companyName.trim();
          return acc;
        }

        acc[fieldKey] = String(manualLeadFieldValues[fieldKey] ?? "").trim();
        return acc;
      },
      {},
    );

    const missingFieldKey = pendingManualLeadFields.find(
      (fieldKey) => !resolvedFieldValues[fieldKey],
    );

    if (missingFieldKey) {
      toast.warning(`Informe ${getManualFieldLabel(missingFieldKey).toLowerCase()}.`);
      return;
    }

    if (resolvedFieldValues.nome_atendente) {
      setStoredAttendantName(resolvedFieldValues.nome_atendente);
    }

    if (resolvedFieldValues.nome_empresa) {
      setStoredCompanyName(resolvedFieldValues.nome_empresa);
    }

    const enrichedLeads = pendingExtraLeads.map((lead) => ({
      ...lead,
      ...resolvedFieldValues,
    }));

    appendManualLeads(enrichedLeads);
    setOpenManualLeadModal(false);
    setWhatsappValue("");
    if (pendingManualLeadAction === "preview") {
      resetPendingManualLeadState();
      triggerPreviewReady();
      return;
    }

    await sendTemplate(enrichedLeads);
    resetPendingManualLeadState();
  }, [
    appendManualLeads,
    attendantName,
    companyName,
    getManualFieldLabel,
    manualLeadFieldValues,
    pendingExtraLeads,
    pendingManualLeadAction,
    pendingManualLeadFields,
    resetPendingManualLeadState,
    sendTemplate,
    triggerPreviewReady,
  ]);

  return {
    whatsappValue,
    handleWhatsappInputChange,
    openManualLeadModal,
    manualLeadFlowAction: pendingManualLeadAction,
    closeManualLeadModal,
    attendantName,
    setAttendantName,
    companyName,
    setCompanyName,
    pendingManualLeadFields,
    manualLeadFieldValues,
    updateManualLeadFieldValue,
    hasTypedWhatsapp,
    shouldDisableLeadWhatsappInput,
    shouldDisableLeadUpload,
    clearLeadSelection,
    getManualFieldLabel,
    prepareDispatchPreview,
    submitDispatch,
    confirmManualLeadDispatch,
  };
}
