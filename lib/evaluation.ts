import type { EvaluationResponse, HoldInput, JudgmentResult } from "@/packages/core";
import { REASON_LABELS } from "@/packages/core";
import {
  createPackForInput,
  createProvider,
  EVALUATION_TIMEOUT_MS,
  type JudgmentProvider,
} from "@/packages/jev-provider";
import { evaluatePolicy } from "@/packages/policy-engine";
import { estimateCostUsd } from "./pricing";

export const MAX_REQUEST_BYTES = 20_000;

export class EvaluationTimeoutError extends Error {
  constructor() {
    super("Evaluation timed out");
    this.name = "EvaluationTimeoutError";
  }
}

export async function withEvaluationTimeout<T>(promise: Promise<T>, timeoutMs = EVALUATION_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new EvaluationTimeoutError()), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function evaluateHold(
  input: HoldInput,
  dependencies: { provider?: JudgmentProvider; mode?: "fake" | "typesafe" } = {},
): Promise<EvaluationResponse> {
  const started = performance.now();
  const pack = createPackForInput(input);
  const selected = dependencies.provider
    ? { provider: dependencies.provider, mode: dependencies.mode ?? "fake" }
    : createProvider();
  const result: JudgmentResult = await withEvaluationTimeout(selected.provider.evaluate(input, pack));
  const decision = evaluatePolicy(input, result);
  const latencyMs = Math.max(1, Math.round(performance.now() - started));

  return {
    verdict: decision.verdict,
    reasons: decision.reasons,
    reasonLabels: decision.reasons.map((reason) => REASON_LABELS[reason]),
    signals: decision.signals,
    policyVersion: decision.policyVersion,
    questionPackVersion: pack.version,
    model: result.model,
    latencyMs,
    estimatedCostUsd: estimateCostUsd(result.usage, selected.mode),
    usage: result.usage ?? null,
    providerMode: selected.mode,
    experimental: true,
  };
}
