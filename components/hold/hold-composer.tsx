"use client";

import {
  ArrowRight01Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  CpuIcon,
  FlashIcon,
  InformationCircleIcon,
  SecurityCheckIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { HoldContext, HoldInput } from "@/packages/core";
import { holdInputSchema } from "@/packages/core";
import { ContextToggle } from "./context-toggle";

interface HoldComposerProps {
  onSubmit: (input: HoldInput) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  onErrorClear: () => void;
  draft: string;
  setDraft: (val: string) => void;
  context: HoldContext;
  setContext: (val: HoldContext) => void;
  audience: string;
  setAudience: (val: string) => void;
  intent: string;
  setIntent: (val: string) => void;
  conversationContext: string;
  setConversationContext: (val: string) => void;
  showOptions: boolean;
  setShowOptions: (val: boolean) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export const examples: Array<{
  name: string;
  context: HoldContext;
  draft: string;
  intent?: string;
  audience?: string;
  conversationContext?: string;
}> = [
  {
    name: "Aggressive sales email",
    context: "email",
    audience: "A founder who has not replied to our last email",
    intent: "Start a useful conversation without pressure",
    draft:
      "You clearly don't understand what you're missing. This is your last chance to buy before the price doubles. Click here now or accept that your team will fall behind.",
  },
  {
    name: "Vague social post",
    context: "social-post",
    audience: "People who follow our studio",
    draft: "Big things coming. Excited for what's next. More soon 👀",
  },
  {
    name: "Hostile support reply",
    context: "support-reply",
    intent: "Resolve the customer's login issue and rebuild trust",
    conversationContext:
      "The customer says they have been locked out since the update and asks when access will be restored.",
    draft:
      "We already told you this is being worked on. Please stop sending the same message. It's not our fault you can't follow basic instructions.",
  },
];

const placeholders: Record<HoldContext, string> = {
  email: "Paste the email you are about to send…",
  "social-post": "Paste the post you are about to publish…",
  "support-reply": "Paste the reply your customer is about to receive…",
};

export function HoldComposer({
  onSubmit,
  isLoading,
  error,
  onErrorClear,
  draft,
  setDraft,
  context,
  setContext,
  audience,
  setAudience,
  intent,
  setIntent,
  conversationContext,
  setConversationContext,
  showOptions,
  setShowOptions,
  textareaRef,
}: HoldComposerProps) {
  const [validationError, setValidationError] = useState<string | null>(null);
  const internalTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Mark hydration for automated testing / accessibility
  useEffect(() => {
    const el = document.getElementById("draft");
    if (el) el.setAttribute("data-hydrated", "true");
  }, []);

  function handleSelectExample(example: (typeof examples)[number]) {
    setContext(example.context);
    setDraft(example.draft);
    setAudience(example.audience ?? "");
    setIntent(example.intent ?? "");
    setConversationContext(example.conversationContext ?? "");
    setShowOptions(Boolean(example.audience || example.intent || example.conversationContext));
    setValidationError(null);
    onErrorClear();

    // Focus textarea
    setTimeout(() => {
      const el = document.getElementById("draft") as HTMLTextAreaElement | null;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }, 50);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (draft.trim() && !isLoading) {
        handleTriggerSubmit();
      }
    }
  }

  function handleTriggerSubmit() {
    setValidationError(null);
    onErrorClear();

    const payload: HoldInput = {
      draft: draft.trim(),
      context,
      ...(audience.trim() ? { audience: audience.trim() } : {}),
      ...(intent.trim() ? { intent: intent.trim() } : {}),
      ...(conversationContext.trim() ? { conversationContext: conversationContext.trim() } : {}),
    };

    const parsed = holdInputSchema.safeParse(payload);
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message || "Check your draft and try again.");
      return;
    }

    onSubmit(parsed.data);
  }

  const isDraftValid = draft.trim().length > 0;
  const isTooLong = draft.length > 8000;

  return (
    <Card className="w-full max-w-[820px] mx-auto border border-border/80 shadow-sm bg-card transition-all">
      <CardHeader className="pb-2 pt-5 px-6">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            What are you sending?
          </span>
          <ContextToggle value={context} onChange={setContext} disabled={isLoading} />
        </div>
      </CardHeader>

      <CardContent className="px-6 py-2 flex flex-col gap-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleTriggerSubmit();
          }}
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <Field data-invalid={Boolean(validationError || isTooLong)}>
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="draft" className="text-sm font-semibold text-foreground">
                  Your draft <span className="text-muted-foreground font-normal ml-1 text-xs">Required</span>
                </FieldLabel>
                <span
                  className={`text-xs tabular-nums font-medium ${
                    isTooLong ? "text-destructive font-bold" : "text-muted-foreground"
                  }`}
                >
                  {draft.length.toLocaleString()} / 8,000
                </span>
              </div>

              <Textarea
                id="draft"
                ref={textareaRef || internalTextareaRef}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (validationError) setValidationError(null);
                  if (error) onErrorClear();
                }}
                onKeyDown={handleKeyDown}
                placeholder={placeholders[context]}
                rows={5}
                maxLength={8000}
                disabled={isLoading}
                aria-invalid={Boolean(validationError || isTooLong)}
                aria-describedby="draft-description"
                className="resize-y text-base sm:text-sm min-h-[110px] sm:min-h-[120px] max-h-[360px] leading-relaxed font-normal bg-background/50 focus:bg-background border border-border shadow-xs focus-visible:border-foreground/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 transition-colors"
              />

              <div
                id="draft-description"
                className="flex items-center justify-between text-sm text-foreground/80 pt-0.5"
              >
                <FieldDescription className="text-sm text-foreground/80">
                  Keep the words yours. HOLD only judges them before they leave the room.
                </FieldDescription>
              </div>

              {validationError && <FieldError errors={[{ message: validationError }]} />}
            </Field>
          </FieldGroup>

          {/* Secondary "Try an example" row below textarea */}
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Try an example:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {examples.map((ex) => (
                <button
                  type="button"
                  key={ex.name}
                  onClick={() => handleSelectExample(ex)}
                  disabled={isLoading}
                  title={`Load ${ex.name}`}
                  aria-label={
                    ex.name === "Hostile support reply" ? "Hostile support reply Frustrated support reply" : ex.name
                  }
                  className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-md border border-border bg-muted/40 text-foreground hover:bg-muted hover:border-foreground/30 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <span>{ex.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Optional context collapsible */}
          <Collapsible open={showOptions} onOpenChange={setShowOptions} className="w-full">
            <CollapsibleTrigger className="h-8 px-2 text-sm font-medium text-foreground/80 hover:text-foreground flex items-center gap-1.5 cursor-pointer rounded-lg hover:bg-muted/50 transition-colors">
              <HugeiconsIcon icon={showOptions ? ChevronUpIcon : ChevronDownIcon} strokeWidth={2} className="size-4" />
              <span>{showOptions ? "Hide extra context" : "Add context (optional)"}</span>
              <span className="text-xs text-muted-foreground font-normal">— audience, intent, history</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 flex flex-col gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="audience" className="text-sm font-medium text-foreground">
                    Audience <span className="text-muted-foreground text-xs font-normal">(Who will read this?)</span>
                  </FieldLabel>
                  <Input
                    id="audience"
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    placeholder="e.g. A busy prospective client"
                    maxLength={2000}
                    disabled={isLoading}
                    className="h-10 text-sm"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="intent" className="text-sm font-medium text-foreground">
                    Intent <span className="text-muted-foreground text-xs font-normal">(Desired outcome)</span>
                  </FieldLabel>
                  <Input
                    id="intent"
                    value={intent}
                    onChange={(e) => setIntent(e.target.value)}
                    placeholder="e.g. Schedule a 15-minute call without pressure"
                    maxLength={2000}
                    disabled={isLoading}
                    className="h-10 text-sm"
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="conversation" className="text-sm font-medium text-foreground">
                  Conversation context{" "}
                  <span className="text-muted-foreground text-xs font-normal">(Prior messages or thread history)</span>
                </FieldLabel>
                <Textarea
                  id="conversation"
                  value={conversationContext}
                  onChange={(e) => setConversationContext(e.target.value)}
                  placeholder="e.g. Customer previously emailed asking why their billing date shifted…"
                  rows={2}
                  maxLength={2000}
                  disabled={isLoading}
                  className="text-sm resize-y min-h-[70px] border border-border"
                />
              </Field>
            </CollapsibleContent>
          </Collapsible>

          {/* Surface errors */}
          {error && (
            <Alert variant="destructive" className="py-2.5">
              <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} className="size-4" />
              <AlertDescription className="text-sm font-medium">{error}</AlertDescription>
            </Alert>
          )}

          {/* Primary Action Button */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
            <Button
              type="submit"
              disabled={isLoading || !isDraftValid}
              className={`h-11 px-6 font-semibold text-sm rounded-xl transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer ${
                !isDraftValid
                  ? "bg-muted text-foreground/75 border border-border/90 shadow-xs cursor-not-allowed opacity-95 dark:bg-muted/80 dark:text-foreground/80"
                  : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm hover:shadow active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              }`}
            >
              {isLoading ? (
                <>
                  <Spinner className="size-4 text-primary-foreground" />
                  <span>Judging 11 signals…</span>
                </>
              ) : (
                <>
                  <span>Judge before sending</span>
                  <Kbd
                    className={`text-xs px-1.5 h-5 font-mono ${
                      !isDraftValid
                        ? "bg-foreground/10 text-foreground/80 border-border/60"
                        : "bg-primary-foreground/20 text-primary-foreground border-transparent"
                    }`}
                  >
                    ⌘↵
                  </Kbd>
                  <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2.5} className="size-4 ml-0.5" />
                </>
              )}
            </Button>

            <span className="text-xs font-medium text-muted-foreground text-center sm:text-right">
              Atomic signals evaluate in parallel
            </span>
          </div>
        </form>
      </CardContent>

      <CardFooter className="px-6 py-3 border-t border-border/60 bg-muted/15 flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
        {/* Trust Row with Tooltips */}
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <Tooltip>
            <TooltipTrigger className="inline-flex items-center gap-1.5 cursor-help hover:text-foreground transition-colors">
              <HugeiconsIcon icon={FlashIcon} strokeWidth={2} className="size-4 text-foreground/70" />
              <span className="font-medium text-xs text-foreground/80">One Jev request</span>
            </TooltipTrigger>
            <TooltipContent>11 atomic System One questions run in parallel in a single Jev request.</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger className="inline-flex items-center gap-1.5 cursor-help hover:text-foreground transition-colors">
              <HugeiconsIcon icon={SecurityCheckIcon} strokeWidth={2} className="size-4 text-foreground/70" />
              <span className="font-medium text-xs text-foreground/80">Nothing stored</span>
            </TooltipTrigger>
            <TooltipContent>HOLD has zero persistence. Drafts and judgments are never logged or stored.</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger className="inline-flex items-center gap-1.5 cursor-help hover:text-foreground transition-colors">
              <HugeiconsIcon icon={CpuIcon} strokeWidth={2} className="size-4 text-foreground/70" />
              <span className="font-medium text-xs text-foreground/80">Typed verdict</span>
            </TooltipTrigger>
            <TooltipContent>
              Deterministic code policy computes SEND, REWRITE, HOLD, or BLOCK from calibrated scores.
            </TooltipContent>
          </Tooltip>
        </div>

        <span className="text-xs font-medium text-muted-foreground">HOLD by AETHER</span>
      </CardFooter>
    </Card>
  );
}
