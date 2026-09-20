export type ProviderMode = "fake" | "typesafe";

export type ProviderEnvironment = {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  HOLD_PROVIDER?: string;
  TYPESAFE_API_KEY?: string;
  HOLD_EVIDENCE_ENABLED?: string;
  EVIDENCE_SEARCH_URL?: string;
  EVIDENCE_SEARCH_API_KEY?: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  HOLD_RATE_LIMIT_SALT?: string;
  HOLD_RATE_LIMIT_REQUESTS?: string;
  HOLD_DAILY_SPEND_USD?: string;
  HOLD_HOURLY_SPEND_USD?: string;
  HOLD_EVIDENCE_DAILY_SPEND_USD?: string;
  HOLD_EVIDENCE_HOURLY_SPEND_USD?: string;
  HOLD_ESTIMATED_COST_PER_REQUEST_USD?: string;
  NEXT_PHASE?: string;
};

export class ProviderConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderConfigurationError";
  }
}

export class ProviderNotConfiguredError extends Error {
  constructor() {
    super("A TypeSafe API key is required for the configured provider.");
    this.name = "ProviderNotConfiguredError";
  }
}

export type ResolvedProviderConfig = {
  mode: ProviderMode;
  isProduction: boolean;
  isDevelopmentSimulation: boolean;
  hasApiKey: boolean;
};

export function isEvidenceEnabled(environment: ProviderEnvironment = process.env): boolean {
  return (
    environment.HOLD_EVIDENCE_ENABLED?.trim().toLowerCase() === "1" ||
    environment.HOLD_EVIDENCE_ENABLED?.trim().toLowerCase() === "true"
  );
}

export function isProductionEnvironment(environment: ProviderEnvironment = process.env): boolean {
  return (
    environment.NODE_ENV?.trim().toLowerCase() === "production" ||
    environment.VERCEL_ENV?.trim().toLowerCase() === "production"
  );
}

function requestedProvider(environment: ProviderEnvironment): string | undefined {
  const value = environment.HOLD_PROVIDER?.trim().toLowerCase();
  return value || undefined;
}

export function resolveProviderConfig(environment: ProviderEnvironment = process.env): ResolvedProviderConfig {
  const requestedMode = requestedProvider(environment);
  const isProduction = isProductionEnvironment(environment);
  const hasApiKey = Boolean(environment.TYPESAFE_API_KEY?.trim());

  if (requestedMode && requestedMode !== "fake" && requestedMode !== "typesafe") {
    throw new ProviderConfigurationError(`Unsupported HOLD_PROVIDER value: ${requestedMode}`);
  }

  if (requestedMode === "fake" && isProduction) {
    throw new ProviderConfigurationError(
      "HOLD_PROVIDER=fake is not allowed when NODE_ENV or VERCEL_ENV indicates production.",
    );
  }

  if (requestedMode === "fake" && !["development", "test"].includes(environment.NODE_ENV?.trim().toLowerCase() || "")) {
    throw new ProviderConfigurationError("HOLD_PROVIDER=fake is only allowed in development or test environments.");
  }

  if (requestedMode === "fake") {
    return { mode: "fake", isProduction, isDevelopmentSimulation: true, hasApiKey };
  }

  return { mode: "typesafe", isProduction, isDevelopmentSimulation: false, hasApiKey };
}

export function validateProviderConfiguration(environment: ProviderEnvironment = process.env): void {
  const config = resolveProviderConfig(environment);
  if (!config.isProduction) return;
  if (environment.NEXT_PHASE === "phase-production-build" && environment.VERCEL_ENV !== "production") return;
  if (!config.hasApiKey) throw new ProviderConfigurationError("TYPESAFE_API_KEY is required in production.");
  if (!environment.UPSTASH_REDIS_REST_URL || !environment.UPSTASH_REDIS_REST_TOKEN) {
    throw new ProviderConfigurationError(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production.",
    );
  }
  if (
    !environment.HOLD_RATE_LIMIT_SALT ||
    /^(?:hold-local-rate-limit|replace-with|change-me|default)/i.test(environment.HOLD_RATE_LIMIT_SALT.trim())
  ) {
    throw new ProviderConfigurationError("HOLD_RATE_LIMIT_SALT must be a non-default value in production.");
  }
  const requests = Number(environment.HOLD_RATE_LIMIT_REQUESTS);
  if (!Number.isFinite(requests) || requests <= 0) {
    throw new ProviderConfigurationError("HOLD_RATE_LIMIT_REQUESTS must be a positive production limit.");
  }
  const dailySpend = Number(environment.HOLD_DAILY_SPEND_USD);
  const hourlySpend = Number(environment.HOLD_HOURLY_SPEND_USD);
  if ((!Number.isFinite(dailySpend) || dailySpend <= 0) && (!Number.isFinite(hourlySpend) || hourlySpend <= 0)) {
    throw new ProviderConfigurationError("Set HOLD_DAILY_SPEND_USD or HOLD_HOURLY_SPEND_USD in production.");
  }
  const estimatedCost = Number(environment.HOLD_ESTIMATED_COST_PER_REQUEST_USD);
  if (!Number.isFinite(estimatedCost) || estimatedCost <= 0) {
    throw new ProviderConfigurationError("HOLD_ESTIMATED_COST_PER_REQUEST_USD must be a positive production estimate.");
  }
  const evidenceEnabled = isEvidenceEnabled(environment);
  if (evidenceEnabled && (!environment.EVIDENCE_SEARCH_URL || !environment.EVIDENCE_SEARCH_API_KEY)) {
    throw new ProviderConfigurationError(
      "Evidence is enabled but EVIDENCE_SEARCH_URL or EVIDENCE_SEARCH_API_KEY is missing.",
    );
  }
  if (evidenceEnabled && environment.EVIDENCE_SEARCH_URL) {
    try {
      const endpoint = new URL(environment.EVIDENCE_SEARCH_URL);
      if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") throw new Error("unsupported protocol");
    } catch {
      throw new ProviderConfigurationError("EVIDENCE_SEARCH_URL must be an HTTP(S) endpoint in production.");
    }
  }
  if (evidenceEnabled) {
    const evidenceDailySpend = Number(environment.HOLD_EVIDENCE_DAILY_SPEND_USD);
    const evidenceHourlySpend = Number(environment.HOLD_EVIDENCE_HOURLY_SPEND_USD);
    if (
      (!Number.isFinite(evidenceDailySpend) || evidenceDailySpend <= 0) &&
      (!Number.isFinite(evidenceHourlySpend) || evidenceHourlySpend <= 0)
    ) {
      throw new ProviderConfigurationError(
        "Set HOLD_EVIDENCE_DAILY_SPEND_USD or HOLD_EVIDENCE_HOURLY_SPEND_USD when Evidence is enabled.",
      );
    }
  }
}
