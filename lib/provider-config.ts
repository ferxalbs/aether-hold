export type ProviderMode = "fake" | "typesafe";

export type ProviderEnvironment = {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  HOLD_PROVIDER?: string;
  TYPESAFE_API_KEY?: string;
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

  if (requestedMode === "fake") {
    return { mode: "fake", isProduction, isDevelopmentSimulation: true, hasApiKey };
  }

  return { mode: "typesafe", isProduction, isDevelopmentSimulation: false, hasApiKey };
}

export function validateProviderConfiguration(environment: ProviderEnvironment = process.env): void {
  resolveProviderConfig(environment);
}
