import type { HoldInput } from "@/packages/core";
import type { QuestionDefinition, QuestionPack } from "./types";

export const QUESTION_PACK_VERSION = "hold-questions-1.0.0";

const commonQuestions: QuestionDefinition[] = [
  {
    kind: "choice",
    id: "recommendedAction",
    prompt:
      "Choose the most appropriate next action for this draft if a person is deciding whether to send or publish it now.",
    options: {
      send: "Send as written: clear, useful, and safe enough for the stated audience.",
      rewrite: "Rewrite before sending: a meaningful writing or fit problem is fixable in the draft.",
      hold: "Hold for human review: uncertainty or a factual/consequential concern needs judgment first.",
      block: "Block: the draft contains a serious safety, privacy, or abuse concern.",
    },
  },
  {
    kind: "choice",
    id: "perceivedIntent",
    prompt: "Identify the primary intent communicated by the draft.",
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
    prompt: "Rate how easy this draft is for its intended reader to understand and act on.",
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
    prompt: "Rate the useful, relevant value this draft gives its recipient or audience.",
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
    prompt: "Rate the draft's interpersonal tone toward its recipient.",
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
      "Does this draft appear to reveal credentials, tokens, private keys, authentication material, or clearly private information?",
    criteria: {
      true: "Yes: the text contains or appears to expose sensitive access material or private information.",
      false: "No: there is no meaningful sign of credentials, authentication material, or clearly private information.",
    },
  },
  {
    kind: "noul",
    id: "hostility",
    prompt: "Does this draft attack, humiliate, threaten, or demean its recipient or a protected group?",
    criteria: {
      true: "Yes: the message contains a meaningful attack, humiliation, threat, or demeaning language.",
      false: "No: the message is not meaningfully hostile, threatening, or demeaning.",
    },
  },
  {
    kind: "noul",
    id: "spamRisk",
    prompt:
      "Would a reasonable recipient interpret this draft as spam, manipulative cold outreach, or excessive promotion?",
    criteria: {
      true: "Yes: the message is likely to feel like spam, manipulation, or excessive promotion.",
      false: "No: the message does not meaningfully resemble spam or manipulative promotion.",
    },
  },
  {
    kind: "noul",
    id: "needsVerification",
    prompt: "Does this draft contain factual claims that should be verified before publication or sending?",
    criteria: {
      true: "Yes: a consequential, specific, current, or externally checkable claim needs verification.",
      false: "No: the message contains no material factual claim that needs a separate check.",
    },
  },
];

export function createQuestionPack(input: HoldInput): QuestionPack {
  const questions = [...commonQuestions];

  if (input.conversationContext) {
    questions.push({
      kind: "noul",
      id: "addressesRequest",
      prompt:
        "Given the conversation context in state, does this draft actually address the other party's request or concern?",
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
      prompt: "Given the explicit intent in state, does the draft advance that stated intent?",
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
