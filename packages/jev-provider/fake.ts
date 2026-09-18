import type { ChoiceSignal, HoldInput, JudgmentResult, NoulSignal, ScoreSignal } from "@/packages/core";
import type { QuestionPack } from "@/packages/question-packs";
import type { JudgmentProvider } from "./index";

const MODEL = "fake-jev-local";

function choice<T extends string>(value: T, confidence: number, labels: readonly T[]): ChoiceSignal<T> {
  const probabilities = Object.fromEntries(
    labels.map((label) => [label, label === value ? confidence : (1 - confidence) / (labels.length - 1)]),
  ) as Record<T, number>;
  return { kind: "choice", choice: value, confidence, probabilities };
}

function score(value: number, confidence = 0.84): ScoreSignal {
  return {
    kind: "score",
    score: value,
    confidence,
    maxScore: 3,
    probabilities: {
      "0": value === 0 ? confidence : 0,
      "1": value === 1 ? confidence : 0,
      "2": value === 2 ? confidence : 0,
      "3": value === 3 ? confidence : 0,
    },
  };
}

function noul(probability: number): NoulSignal {
  return { kind: "noul", probability };
}

function baseResult(): JudgmentResult {
  return {
    recommendedAction: choice("send", 0.88, ["send", "rewrite", "hold", "block"]),
    perceivedIntent: choice("inform", 0.82, ["inform", "ask", "sell", "support", "vent", "attack", "unclear"]),
    clarity: score(3),
    recipientValue: score(3),
    tone: score(0),
    secretExposure: noul(0.02),
    hostility: noul(0.03),
    spamRisk: noul(0.04),
    needsVerification: noul(0.08),
    model: MODEL,
    usage: { inputTokens: 0, outputTokens: 0 },
  };
}

function lowerText(input: HoldInput): string {
  return [input.draft, input.audience, input.intent, input.conversationContext].filter(Boolean).join(" ").toLowerCase();
}

export type FakeProviderOptions = {
  delayMs?: number;
  failure?: boolean;
  resultFactory?: (input: HoldInput) => JudgmentResult;
};

export class FakeJudgmentProvider implements JudgmentProvider {
  private readonly options: FakeProviderOptions;

  constructor(options: FakeProviderOptions = {}) {
    this.options = options;
  }

  async evaluate(input: HoldInput, pack: QuestionPack): Promise<JudgmentResult> {
    void pack;
    const delayMs = this.options.delayMs ?? Number(process.env.HOLD_FAKE_DELAY_MS || 0);
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (this.options.failure || process.env.HOLD_FAKE_FAILURE === "1") throw new Error("Fake provider failure");
    if (this.options.resultFactory) return this.options.resultFactory(input);

    const result = baseResult();
    const text = lowerText(input);

    const hasSecret = /(sk-[a-z0-9_-]{12,}|api[_ -]?key|access[_ -]?token|private key|password\s*[:=])/i.test(text);
    const isHostile =
      /(idiot|moron|shut up|useless|stupid|hate you|you people|i will ruin|kill you|go to hell|stop sending|not our fault|can't follow|basic instructions)/i.test(
        text,
      );
    const isSpam = /(limited time|buy now|act now|guaranteed|free money|100% off|click here|dear friend)/i.test(text);
    const isVague =
      input.context === "social-post" &&
      (input.draft.trim().length < 80 ||
        /thoughts\?|just saying|big things coming|excited to share/i.test(input.draft));
    const needsVerification =
      /\b(according to|study|research|data shows|will save|guaranteed|always|never|percent|%|today|yesterday|tomorrow|breaking)\b/i.test(
        text,
      );
    const lowConfidence = /\b(maybe|not sure|unclear|guess)\b/i.test(text);

    if (hasSecret) {
      result.secretExposure = noul(0.96);
      result.recommendedAction = choice("block", 0.96, ["send", "rewrite", "hold", "block"]);
    }

    if (isHostile) {
      result.hostility = noul(0.94);
      result.tone = score(3, 0.92);
      result.perceivedIntent = choice("attack", 0.92, [
        "inform",
        "ask",
        "sell",
        "support",
        "vent",
        "attack",
        "unclear",
      ]);
      result.recommendedAction = choice("block", 0.91, ["send", "rewrite", "hold", "block"]);
    }

    if (isSpam) {
      result.spamRisk = noul(0.82);
      result.perceivedIntent = choice("sell", 0.87, ["inform", "ask", "sell", "support", "vent", "attack", "unclear"]);
      result.recommendedAction = choice("rewrite", 0.85, ["send", "rewrite", "hold", "block"]);
    }

    if (isVague) {
      result.clarity = score(1, 0.86);
      result.recipientValue = score(1, 0.8);
      result.recommendedAction = choice("rewrite", 0.84, ["send", "rewrite", "hold", "block"]);
    }

    if (needsVerification) {
      result.needsVerification = noul(0.78);
      result.recommendedAction = choice("hold", 0.82, ["send", "rewrite", "hold", "block"]);
    }

    if (lowConfidence) {
      result.recommendedAction = choice("hold", 0.48, ["send", "rewrite", "hold", "block"]);
    }

    if (input.intent) {
      const mismatch = /apolog|de-escalat|reassure/i.test(input.intent) && (isHostile || isSpam);
      result.intentAlignment = noul(mismatch ? 0.28 : 0.82);
    }

    if (input.conversationContext) {
      const doesNotAddress =
        /refund|cancel|login|broken|charged|order|delivery/i.test(input.conversationContext) &&
        !/refund|cancel|login|fix|help|order|delivery|sorry|understand/i.test(input.draft);
      result.addressesRequest = noul(doesNotAddress ? 0.28 : 0.82);
    }

    return result;
  }
}
