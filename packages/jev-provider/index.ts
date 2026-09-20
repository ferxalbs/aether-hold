import { choice, noul, type Questions, score, TypeSafeClient } from "@typesafe-ai/sdk";
import { ProviderConfigurationError, ProviderNotConfiguredError, resolveProviderConfig } from "@/lib/provider-config";
import type {
  ChoiceSignal,
  HoldInput,
  JudgmentResult,
  NoulSignal,
  PerceivedIntent,
  ProviderUsage,
  ScoreSignal,
} from "@/packages/core";
import { PERCEIVED_INTENTS } from "@/packages/core";
import type { QuestionPack } from "@/packages/question-packs";
import { createQuestionPack } from "@/packages/question-packs";
import { FakeJudgmentProvider } from "./fake";

export const EVALUATION_TIMEOUT_MS = 9_000;

export interface JudgmentProvider {
  evaluate(input: HoldInput, pack: QuestionPack, signal?: AbortSignal): Promise<JudgmentResult>;
}

function buildQuestions(pack: QuestionPack): Questions {
  const questions: Questions = {};

  for (const question of pack.questions) {
    if (question.kind === "choice") {
      questions[question.id] = choice(question.prompt, question.options);
    } else if (question.kind === "score") {
      questions[question.id] = score(question.prompt, question.levels);
    } else {
      questions[question.id] = noul(question.prompt, question.criteria ?? null);
    }
  }

  return questions;
}

function probabilityMap(answer: unknown, requiredKeys: readonly string[]): Record<string, number> | null {
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) return null;
  const entries = Object.entries(answer as Record<string, unknown>);
  if (
    entries.length !== requiredKeys.length ||
    requiredKeys.some((key) => !Object.hasOwn(answer, key)) ||
    entries.some(
      ([, probability]) =>
        typeof probability !== "number" || !Number.isFinite(probability) || probability < 0 || probability > 1,
    )
  ) {
    return null;
  }
  const total = entries.reduce((sum, [, probability]) => sum + Number(probability), 0);
  // The API returns rounded probabilities, so permit small residuals while still
  // rejecting maps whose mass is materially inconsistent with a distribution.
  if (Math.abs(total - 1) > 0.05) return null;
  return answer as Record<string, number>;
}

function asChoice<T extends string>(answer: unknown, allowedChoices?: readonly T[]): ChoiceSignal<T> {
  if (!answer || typeof answer !== "object") throw new Error("Malformed choice answer");
  const value = answer as { type?: unknown; choice?: unknown; confidence?: unknown; probabilities?: unknown };
  const probabilities = probabilityMap(value.probabilities, allowedChoices ?? []);
  if (
    value.type !== "choice" ||
    typeof value.choice !== "string" ||
    (allowedChoices && !allowedChoices.includes(value.choice as T)) ||
    typeof value.confidence !== "number" ||
    !probabilities ||
    !Number.isFinite(value.confidence) ||
    value.confidence < 0 ||
    value.confidence > 1
  ) {
    throw new Error("Malformed choice answer");
  }
  return {
    kind: "choice",
    choice: value.choice as T,
    confidence: value.confidence,
    probabilities: probabilities as Record<T, number>,
  };
}

function asScore(answer: unknown, maxScore: number): ScoreSignal {
  if (!answer || typeof answer !== "object") throw new Error("Malformed score answer");
  const value = answer as { type?: unknown; score?: unknown; confidence?: unknown; probabilities?: unknown };
  const probabilities = probabilityMap(
    value.probabilities,
    Array.from({ length: maxScore + 1 }, (_, scoreValue) => String(scoreValue)),
  );
  if (
    value.type !== "score" ||
    typeof value.score !== "number" ||
    typeof value.confidence !== "number" ||
    !probabilities ||
    !Number.isFinite(value.score) ||
    value.score < 0 ||
    value.score > maxScore ||
    !Number.isFinite(value.confidence) ||
    value.confidence < 0 ||
    value.confidence > 1
  ) {
    throw new Error("Malformed score answer");
  }
  return {
    kind: "score",
    score: value.score,
    confidence: value.confidence,
    probabilities: probabilities as Record<string, number>,
    maxScore,
  };
}

function asNoul(answer: unknown): NoulSignal {
  if (
    !answer ||
    typeof answer !== "object" ||
    (answer as { type?: unknown }).type !== "noul" ||
    typeof (answer as { noul?: unknown }).noul !== "number" ||
    !Number.isFinite((answer as { noul: number }).noul) ||
    (answer as { noul: number }).noul < 0 ||
    (answer as { noul: number }).noul > 1
  ) {
    throw new Error("Malformed noul answer");
  }
  return { kind: "noul", probability: (answer as { noul: number }).noul };
}

export class TypeSafeJudgmentProvider implements JudgmentProvider {
  private readonly client: TypeSafeClient;

  constructor() {
    const config = resolveProviderConfig();
    if (config.mode !== "typesafe") {
      throw new ProviderConfigurationError("The TypeSafe provider cannot be constructed while fake mode is selected.");
    }
    if (!config.hasApiKey) throw new ProviderNotConfiguredError();

    this.client = new TypeSafeClient({
      apiKey: process.env.TYPESAFE_API_KEY,
      defaultModel: process.env.TYPESAFE_DEFAULT_MODEL || "jev-latest",
      timeout: EVALUATION_TIMEOUT_MS,
      logLevel: "off",
      retry: { maxRetries: 0 },
    });
  }

  async evaluate(input: HoldInput, pack: QuestionPack, signal?: AbortSignal): Promise<JudgmentResult> {
    const response = await this.client.systemOne(
      {
        model: process.env.TYPESAFE_DEFAULT_MODEL || "jev-latest",
        state: {
          draft: input.draft,
          context: input.context,
          audience: input.audience ?? null,
          intent: input.intent ?? null,
          conversationContext: input.conversationContext ?? null,
        },
        questions: buildQuestions(pack),
      },
      { signal, timeout: EVALUATION_TIMEOUT_MS, retry: { maxRetries: 0 } },
    );

    if (!response.answers || typeof response.answers !== "object" || Array.isArray(response.answers)) {
      throw new Error("Malformed answers");
    }
    const answers = response.answers as Record<string, unknown>;
    const definitions = new Map(pack.questions.map((question) => [question.id, question]));
    for (const question of pack.questions) {
      if (!Object.hasOwn(answers, question.id)) {
        throw new Error(`Missing answer: ${question.id}`);
      }
    }
    const maxScoreFor = (id: string) => {
      const definition = definitions.get(id);
      return definition?.kind === "score" ? definition.levels.length - 1 : 1;
    };

    const usage: ProviderUsage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };

    return {
      perceivedIntent: asChoice<PerceivedIntent>(answers.perceivedIntent, PERCEIVED_INTENTS),
      clarity: asScore(answers.clarity, maxScoreFor("clarity")),
      recipientValue: asScore(answers.recipientValue, maxScoreFor("recipientValue")),
      tone: asScore(answers.tone, maxScoreFor("tone")),
      secretExposure: asNoul(answers.secretExposure),
      hostility: asNoul(answers.hostility),
      spamRisk: asNoul(answers.spamRisk),
      needsVerification: asNoul(answers.needsVerification),
      containsCheckableClaim: asNoul(answers.containsCheckableClaim),
      claimConsequence: asScore(answers.claimConsequence, maxScoreFor("claimConsequence")),
      addressesRequest: definitions.has("addressesRequest") ? asNoul(answers.addressesRequest) : undefined,
      intentAlignment: definitions.has("intentAlignment") ? asNoul(answers.intentAlignment) : undefined,
      model: response.model,
      usage,
    };
  }
}

export function createProvider(): { provider: JudgmentProvider; mode: "fake" | "typesafe" } {
  const config = resolveProviderConfig();

  if (config.mode === "fake") return { provider: new FakeJudgmentProvider(), mode: "fake" };
  return { provider: new TypeSafeJudgmentProvider(), mode: "typesafe" };
}

export function createPackForInput(input: HoldInput): QuestionPack {
  return createQuestionPack(input);
}

export type { QuestionDefinition, QuestionPack } from "@/packages/question-packs";
export { FakeJudgmentProvider } from "./fake";
