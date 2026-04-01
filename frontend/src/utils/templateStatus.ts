export function normalizeTemplateMetaStatus(status?: string | null) {
  return String(status ?? "").trim().toUpperCase();
}

export function isTemplateApproved(status?: string | null) {
  return normalizeTemplateMetaStatus(status) === "APPROVED";
}

export function getTemplateStatusLabel(status?: string | null) {
  const normalized = normalizeTemplateMetaStatus(status);

  if (normalized === "APPROVED") return "Aprovado";
  if (normalized === "PENDING") return "Em analise";
  if (normalized === "IN_REVIEW") return "Em analise";
  if (normalized === "PENDING_REVIEW") return "Em analise";
  if (normalized === "REJECTED") return "Rejeitado";
  if (normalized === "PAUSED") return "Pausado";
  if (normalized === "DISABLED") return "Desativado";
  if (normalized === "DELETED") return "Excluido";
  if (normalized === "DRAFT") return "Rascunho";

  return normalized || "Status desconhecido";
}

export function getTemplateStatusTone(status?: string | null) {
  const normalized = normalizeTemplateMetaStatus(status);

  if (normalized === "APPROVED") return "approved";
  if (normalized === "REJECTED" || normalized === "PAUSED" || normalized === "DISABLED") {
    return "danger";
  }
  if (normalized === "PENDING" || normalized === "IN_REVIEW" || normalized === "PENDING_REVIEW") {
    return "warning";
  }

  return "neutral";
}
