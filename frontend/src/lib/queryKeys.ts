export const queryKeys = {
  campaigns: {
    all: (account: string) => ["campaigns", account] as const,
    metrics: (account: string) => ["campaigns", account, "metrics"] as const,
    categories: () => ["categories"] as const,
    collectionsMetrics: (account: string) =>
      ["campaigns", account, "collectionsMetrics"] as const,
  },
  templates: {
    list: (account: string, params: object) =>
      ["templates", account, params] as const,
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
  },
} as const;
