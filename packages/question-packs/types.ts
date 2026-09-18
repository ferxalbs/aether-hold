import type { HoldContext, HoldInput } from "@/packages/core";

export type ChoiceQuestionDefinition = {
  kind: "choice";
  id: string;
  prompt: string;
  options: Record<string, string | null>;
};

export type ScoreQuestionDefinition = {
  kind: "score";
  id: string;
  prompt: string;
  levels: readonly [string | null, string | null, ...(string | null)[]];
};

export type NoulQuestionDefinition = {
  kind: "noul";
  id: string;
  prompt: string;
  criteria?: { true?: string; false?: string };
};

export type QuestionDefinition = ChoiceQuestionDefinition | ScoreQuestionDefinition | NoulQuestionDefinition;

export type QuestionPack = {
  id: "hold";
  version: string;
  context: HoldContext;
  questions: QuestionDefinition[];
};

export type QuestionPackFactory = (input: HoldInput) => QuestionPack;
