import { choice, noul, type Questions, score, TypeSafeClient } from "@typesafe-ai/sdk";
import type {
  ChoiceSignal,
  HoldInput,
  JudgmentResult,
  NoulSignal,
  PerceivedIntent,
  ProviderUsage,
  RecommendedAction,
  ScoreSignal,
} from "@/packages/core";
import type { QuestionPack } from "@/packages/question-packs";
import { createQuestionPack } from "@/packages/question-packs";
import { FakeJudgmentProvider } from "./fake";

export const EVALUATION_TIMEOUT_MS = 9_000;

export interface JudgmentProvider {
  evaluate(input: HoldInput, pack: QuestionPack): Promise<JudgmentResult>;
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

function asChoice<T extends string>(answer: unknown): ChoiceSignal<T> {
  if (!answer || typeof answer !== "object") throw new Error("Malformed choice answer");
  const value = answer as { choice?: unknown; confidence?: unknown; probabilities?: unknown };
  if (
    typeof value.choice !== "string" ||
    typeof value.confidence !== "number" ||
    !value.probabilities ||
    typeof value.probabilities !== "object"
  ) {
    throw new Error("Malformed choice answer");
  }
  return {
    kind: "choice",
    choice: value.choice as T,
    confidence: value.confidence,
    probabilities: value.probabilities as Record<T, number>,
  };
}

function asScore(answer: unknown, maxScore: number): ScoreSignal {
  if (!answer || typeof answer !== "object") throw new Error("Malformed score answer");
  const value = answer as { score?: unknown; confidence?: unknown; probabilities?: unknown };
  if (
    typeof value.score !== "number" ||
    typeof value.confidence !== "number" ||
    !value.probabilities ||
    typeof value.probabilities !== "object"
  ) {
    throw new Error("Malformed score answer");
  }
  return {
    kind: "score",
    score: value.score,
    confidence: value.confidence,
    probabilities: value.probabilities as Record<string, number>,
    maxScore,
  };
}

function asNoul(answer: unknown): NoulSignal {
  if (!answer || typeof answer !== "object" || typeof (answer as { noul?: unknown }).noul !== "number") {
    throw new Error("Malformed noul answer");
  }
  return { kind: "noul", probability: (answer as { noul: number }).noul };
}

export class TypeSafeJudgmentProvider implements JudgmentProvider {
  private readonly client: TypeSafeClient;

  constructor() {
    this.client = new TypeSafeClient({
      apiKey: process.env.TYPESAFE_API_KEY,
      defaultModel: process.env.TYPESAFE_DEFAULT_MODEL || "jev-latest",
      timeout: EVALUATION_TIMEOUT_MS,
      logLevel: "off",
      retry: { maxRetries: 0 },
    });
  }

  async evaluate(input: HoldInput, pack: QuestionPack): Promise<JudgmentResult> {
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
      { timeout: EVALUATION_TIMEOUT_MS, retry: { maxRetries: 0 } },
    );

    const answers = response.answers as Record<string, unknown>;
    const definitions = new Map(pack.questions.map((question) => [question.id, question]));
    const maxScoreFor = (id: string) => {
      const definition = definitions.get(id);
      return definition?.kind === "score" ? definition.levels.length - 1 : 1;
    };

    const usage: ProviderUsage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };

    return {
      recommendedAction: asChoice<RecommendedAction>(answers.recommendedAction),
      perceivedIntent: asChoice<PerceivedIntent>(answers.perceivedIntent),
      clarity: asScore(answers.clarity, maxScoreFor("clarity")),
      recipientValue: asScore(answers.recipientValue, maxScoreFor("recipientValue")),
      tone: asScore(answers.tone, maxScoreFor("tone")),
      secretExposure: asNoul(answers.secretExposure),
      hostility: asNoul(answers.hostility),
      spamRisk: asNoul(answers.spamRisk),
      needsVerification: asNoul(answers.needsVerification),
      addressesRequest: answers.addressesRequest ? asNoul(answers.addressesRequest) : undefined,
      intentAlignment: answers.intentAlignment ? asNoul(answers.intentAlignment) : undefined,
      model: response.model,
      usage,
    };
  }
}

export function createProvider(): { provider: JudgmentProvider; mode: "fake" | "typesafe" } {
  const requestedMode = process.env.HOLD_PROVIDER?.toLowerCase();
  const useTypeSafe = requestedMode === "typesafe" || (!requestedMode && Boolean(process.env.TYPESAFE_API_KEY));

  if (useTypeSafe) return { provider: new TypeSafeJudgmentProvider(), mode: "typesafe" };
  return { provider: new FakeJudgmentProvider(), mode: "fake" };
}

export function createPackForInput(input: HoldInput): QuestionPack {
  return createQuestionPack(input);
}

export type { QuestionDefinition, QuestionPack } from "@/packages/question-packs";
export { FakeJudgmentProvider } from "./fake";
