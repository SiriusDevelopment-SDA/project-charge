export const queryKeys = {
  campaigns: {
    all: (account: string) => ["campaigns", account] as const,
    metricsBase: (account: string) => ["campaigns", account, "metrics"] as const,
    metrics: (
      account: string,
      params: { search?: string; category?: string } = {},
    ) => ["campaigns", account, "metrics", params] as const,
    categories: () => ["categories"] as const,
    collectionsMetrics: (account: string) =>
      ["campaigns", account, "collectionsMetrics"] as const,
  },
  templates: {
    list: (account: string, params: object) =>
      ["templates", account, params] as const,
    usage: (account: string) =>
      ["templates", account, "usage"] as const,
  },
  clients: {
    list: (account: string, params: object) =>
      ["clients", account, params] as const,
    invoices: (documents: string[]) =>
      ["invoices", [...documents].sort().join(",")] as const,
    services: (companyId: string) => ["services", companyId] as const,
  },
  history: {
    list: (account: string, params: object) =>
      ["history", account, params] as const,
    latestReport: (account: string, scope: string) =>
      ["history", account, "latest", scope] as const,
  },
  dashboard: {
    charges: (companyId: string) =>
      ["dashboard", "charges", companyId] as const,
    returnRate: (companyId: string) =>
      ["dashboard", "returnRate", companyId] as const,
    campaigns: (companyId: string) =>
      ["dashboard", "campaigns", companyId] as const,
    promises: (companyId: string) =>
      ["dashboard", "promises", companyId] as const,
    aging: (companyId: string) =>
      ["dashboard", "aging", companyId] as const,
    forecast: (companyId: string) =>
      ["dashboard", "forecast", companyId] as const,
    debtConversion: (companyId: string) =>
      ["dashboard", "debtConversion", companyId] as const,
    all: (companyId: string) =>
      ["dashboard", companyId] as const,
  },
} as const;
