import type { HoldInput } from "@/packages/core";
import type { QuestionDefinition, QuestionPack } from "./types";

export const QUESTION_PACK_VERSION = "hold-questions-2.0.0-atomic";

const commonQuestions: QuestionDefinition[] = [
  {
    kind: "choice",
    id: "perceivedIntent",
    prompt:
      "Evaluate the exact field `draft` and identify its single primary communication intent. Do not decide whether it is ready to send.",
    options: {
      inform: "Share information or an update.",
      ask: "Ask a question or request an action.",
      sell: "Promote, persuade, or make a sales pitch.",
      support: "Help, resolve, or respond to a support need.",
      vent: "Express frustration or emotion without a clear request.",
      attack: "Attack, shame, threaten, or demean a person or group.",
      unclear: "No primary intent can be identified reliably.",
    },
  },
  {
    kind: "score",
    id: "clarity",
    prompt:
      "Evaluate only the exact field `draft`: rate how easy it is for the intended reader to understand the message and act on its stated request or next step. Do not judge safety or whether to send it.",
    levels: [
      "Confusing or internally contradictory; the reader cannot reliably tell what it means.",
      "Understandable but unfocused; the main point or next step is difficult to find.",
      "Clear and adequately focused; the main point and next step are understandable.",
      "Exceptionally clear and direct; every important part earns its place.",
    ],
  },
  {
    kind: "score",
    id: "recipientValue",
    prompt:
      "Evaluate only the exact field `draft` in relation to `audience`: rate the useful, relevant value it gives the recipient. Do not decide whether to send it.",
    levels: [
      "No identifiable value; it is noise, empty assertion, or unusable to the recipient.",
      "Limited value or mostly noise; the recipient would need substantial work to benefit.",
      "Useful and relevant; the recipient can understand why this matters.",
      "Highly useful and immediately actionable; it helps the recipient make progress now.",
    ],
  },
  {
    kind: "score",
    id: "tone",
    prompt:
      "Evaluate only the interpersonal language in `draft` toward its recipient. Rate the most severe tone present. Do not make the final communication decision.",
    levels: [
      "Calm and constructive.",
      "Tense but professional.",
      "Aggressive or demeaning.",
      "Threatening or abusive.",
    ],
  },
  {
    kind: "noul",
    id: "secretExposure",
    prompt:
      "Evaluate only `draft`: does it appear to reveal credentials, tokens, private keys, authentication material, or clearly private information? Do not decide the final verdict.",
    criteria: {
      true: "Yes: the text contains or appears to expose sensitive access material or private information.",
      false: "No: there is no meaningful sign of credentials, authentication material, or clearly private information.",
    },
  },
  {
    kind: "noul",
    id: "hostility",
    prompt:
      "Evaluate only `draft`: does it attack, humiliate, threaten, or demean its recipient or a protected group? Do not decide the final verdict.",
    criteria: {
      true: "Yes: the message contains a meaningful attack, humiliation, threat, or demeaning language.",
      false: "No: the message is not meaningfully hostile, threatening, or demeaning.",
    },
  },
  {
    kind: "noul",
    id: "spamRisk",
    prompt:
      "Evaluate only `draft`: would a reasonable recipient interpret it as spam, manipulative cold outreach, or excessive promotion? Do not decide the final verdict.",
    criteria: {
      true: "Yes: the message is likely to feel like spam, manipulation, or excessive promotion.",
      false: "No: the message does not meaningfully resemble spam or manipulative promotion.",
    },
  },
  {
    kind: "noul",
    id: "needsVerification",
    prompt:
      "Evaluate only `draft`: does it contain a material, current, consequential, or explicitly uncertain factual claim that should be checked against an external source before publication or sending? Routine logistics, schedules, sender-owned commitments, and ordinary instructions are not verification-needed unless the draft flags uncertainty or asks the reader to rely on an outside fact. Generic promotional language such as 'guaranteed results' without a concrete measurable or current claim is handled by spam/tone signals instead. Do not decide the final verdict.",
    criteria: {
      true: "Yes: a material, specific, current, uncertain, or consequential external fact needs verification before the message should be relied on.",
      false:
        "No: the message is routine logistics, a sender-owned update or commitment, an instruction, or generic promotion without a material external claim needing a separate check.",
    },
  },
  {
    kind: "noul",
    id: "containsCheckableClaim",
    prompt:
      "Evaluate only `draft`: does it contain at least one factual assertion whose truth could be checked against an external source? Treat opinions, preferences, greetings, and purely hypothetical ideas as false. Do not decide whether it is true or whether to send it.",
    criteria: {
      true: "Yes: at least one sentence asserts a fact about a person, event, number, cause, current state, research result, or other externally checkable matter.",
      false:
        "No: the draft contains no externally checkable factual assertion; it is only opinion, preference, emotion, question, greeting, or non-factual wording.",
    },
  },
  {
    kind: "score",
    id: "claimConsequence",
    prompt:
      "Evaluate only the factual assertions in `draft`: rate the consequence of publishing the most consequential assertion incorrectly. If there is no checkable assertion, use the lowest level. Do not decide the final verdict.",
    levels: [
      "No checkable assertion or an inconsequential statement where an error would not affect a person's decision, safety, money, rights, or reputation.",
      "A checkable statement where an error could cause limited confusion or a minor decision problem, but little material harm.",
      "A checkable statement where an error could materially affect a team's, customer's, or audience's decision, money, access, or reputation.",
      "A checkable statement where an error could materially affect safety, health, legal rights, security, finances, or a large audience's behavior.",
    ],
  },
];

export function createQuestionPack(input: HoldInput): QuestionPack {
  const questions = [...commonQuestions];

  if (input.conversationContext) {
    questions.push({
      kind: "noul",
      id: "addressesRequest",
      prompt:
        "Evaluate `draft` against `conversationContext`: does this draft actually address the other party's request or concern? Do not judge tone, safety, or the final verdict.",
      criteria: {
        true: "Yes: it responds to the request or concern with a relevant answer, action, or acknowledgement.",
        false: "No: it changes the subject, avoids the request, or leaves the concern unanswered.",
      },
    });
  }

  if (input.intent) {
    questions.push({
      kind: "noul",
      id: "intentAlignment",
      prompt:
        "Evaluate `draft` against `intent`: does the wording make meaningful progress toward that stated intent? Do not judge tone, safety, or the final verdict.",
      criteria: {
        true: "Yes: the wording makes meaningful progress toward the stated intent.",
        false: "No: the wording undermines, contradicts, or fails to advance the stated intent.",
      },
    });
  }

  return {
    id: "hold",
    version: QUESTION_PACK_VERSION,
    context: input.context,
    questions,
  };
}

export type { QuestionDefinition, QuestionPack } from "./types";
