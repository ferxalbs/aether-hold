"use client";

import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { useRef, useState } from "react";
import { HoldComposer } from "@/components/hold/hold-composer";
import { JudgmentLoading } from "@/components/hold/judgment-loading";
import { VerdictPanel } from "@/components/hold/verdict-panel";
import type { EvaluationErrorResponse, EvaluationResponse, HoldContext, HoldInput } from "@/packages/core";

export default function HoldClient() {
  const [context, setContext] = useState<HoldContext>("email");
  const [draft, setDraft] = useState("");
  const [audience, setAudience] = useState("");
  const [intent, setIntent] = useState("");
  const [conversationContext, setConversationContext] = useState("");
  const [showOptions, setShowOptions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<EvaluationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function handleSubmit(payload: HoldInput) {
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });

      const data = (await response.json()) as EvaluationResponse | EvaluationErrorResponse;
      if (!response.ok || "error" in data) {
        setError("message" in data ? data.message : "HOLD could not complete this judgment. Please try again.");
        return;
      }
      setResult(data);
    } catch {
      setError("The connection was interrupted. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleEditDraft() {
    // Keep draft and focus composer
    setTimeout(() => {
      const el = document.getElementById("draft");
      if (el) {
        el.focus();
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 50);
  }

  function handleJudgeAnother() {
    setResult(null);
    setError(null);
    setDraft("");
    setAudience("");
    setIntent("");
    setConversationContext("");
    setShowOptions(false);
    setTimeout(() => {
      const el = document.getElementById("draft");
      if (el) el.focus();
    }, 50);
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-foreground selection:text-background">
      {/* Top navigation: compact, clear */}
      <header className="sticky top-0 z-40 w-full border-b border-border/70 bg-background/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <Link href="/" className="font-extrabold tracking-tight text-lg hover:opacity-80 transition-opacity">
              HOLD
            </Link>
            <span className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">by AETHER</span>
          </div>

          <nav className="flex items-center gap-5 text-xs font-medium text-muted-foreground" aria-label="Primary">
            <Link href="/method" className="hover:text-foreground transition-colors">
              Method
            </Link>
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground transition-colors inline-flex items-center gap-1"
            >
              <span>GitHub</span>
              <HugeiconsIcon icon={ArrowUpRight01Icon} strokeWidth={2} className="size-3" />
            </a>
          </nav>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col">
        {/* Focused hero: fits comfortably in 1440x900 without clipping */}
        <section className="hero text-center max-w-2xl mx-auto mb-6 sm:mb-8" id="judge">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted/60 border border-border/60 text-xs font-semibold text-muted-foreground mb-3">
            <span className="size-1.5 rounded-full bg-emerald-600 animate-pulse" />
            <span>Private second opinion</span>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-foreground leading-tight sm:leading-none">
            Should this be sent?
          </h1>
          <p className="mt-2.5 text-sm sm:text-base text-muted-foreground max-w-lg mx-auto font-normal leading-relaxed">
            A fast second opinion before your words leave the room.
          </p>
        </section>

        {/* Content Layout: switches from centered single composer to responsive side-by-side or stacked view when evaluated */}
        {!result ? (
          <div className="flex flex-col items-center gap-6 w-full animate-in fade-in-50 duration-200">
            <HoldComposer
              onSubmit={handleSubmit}
              isLoading={isLoading}
              error={error}
              onErrorClear={() => setError(null)}
              draft={draft}
              setDraft={setDraft}
              context={context}
              setContext={setContext}
              audience={audience}
              setAudience={setAudience}
              intent={intent}
              setIntent={setIntent}
              conversationContext={conversationContext}
              setConversationContext={setConversationContext}
              showOptions={showOptions}
              setShowOptions={setShowOptions}
              textareaRef={textareaRef}
            />

            {isLoading && (
              <div className="w-full max-w-[820px]">
                <JudgmentLoading />
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start w-full animate-in fade-in-50 duration-300">
            {/* Verdict Panel takes primary visual weight */}
            <div className="lg:col-span-7 order-1 lg:order-2">
              <VerdictPanel result={result} onEditDraft={handleEditDraft} onJudgeAnother={handleJudgeAnother} />
            </div>

            {/* Composer in compact/context mode */}
            <div className="lg:col-span-5 order-2 lg:order-1">
              <HoldComposer
                onSubmit={handleSubmit}
                isLoading={isLoading}
                error={error}
                onErrorClear={() => setError(null)}
                draft={draft}
                setDraft={setDraft}
                context={context}
                setContext={setContext}
                audience={audience}
                setAudience={setAudience}
                intent={intent}
                setIntent={setIntent}
                conversationContext={conversationContext}
                setConversationContext={setConversationContext}
                showOptions={showOptions}
                setShowOptions={setShowOptions}
                textareaRef={textareaRef}
              />
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-border/60 py-6 mt-12 bg-background/50 text-xs text-muted-foreground">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">HOLD</span>
            <span>by AETHER</span>
            <span>·</span>
            <span>Open source pre-send judgment layer</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/method" className="hover:text-foreground transition-colors underline underline-offset-4">
              Read the method
            </Link>
            <span>·</span>
            <a
              href="https://docs.typesafe.ai"
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground transition-colors"
            >
              Powered by TypeSafe Jev
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
