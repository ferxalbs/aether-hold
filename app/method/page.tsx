import {
  ArrowLeft01Icon,
  ArrowUpRight01Icon,
  CheckmarkCircle02Icon,
  CpuIcon,
  FlashIcon,
  InformationCircleIcon,
  LockIcon,
  SecurityCheckIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { POLICY_THRESHOLDS, POLICY_VERSION } from "@/packages/policy-engine";
import { QUESTION_PACK_VERSION } from "@/packages/question-packs";

export const metadata: Metadata = {
  title: "Method — HOLD by AETHER",
  description: "How HOLD combines TypeSafe Jev judgments with deterministic policy.",
};

const thresholdRows = [
  [
    "Secret exposure",
    `≥ ${POLICY_THRESHOLDS.secretExposureBlock}`,
    "BLOCK",
    "Immediate stop for API keys, passwords, or credentials",
  ],
  ["Hostility", `≥ ${POLICY_THRESHOLDS.hostilityBlock}`, "BLOCK", "Unacceptable interpersonal hostility or aggression"],
  [
    "Needs verification",
    `≥ ${POLICY_THRESHOLDS.needsVerificationHold}`,
    "HOLD",
    "Unsubstantiated factual or statistical claims",
  ],
  [
    "Recommended action confidence",
    `< ${POLICY_THRESHOLDS.recommendedActionConfidenceHold}`,
    "HOLD",
    "Low distribution confidence for choice judgment",
  ],
  [
    "Spam risk",
    `≥ ${POLICY_THRESHOLDS.spamRiskRewrite}`,
    "REWRITE",
    "High likelihood of spam triggers or promotional phrasing",
  ],
  [
    "Clarity (normalized)",
    `< ${POLICY_THRESHOLDS.clarityRewrite}`,
    "REWRITE",
    "Vague, confusing, or poorly structured writing",
  ],
  [
    "Recipient value (normalized)",
    `< ${POLICY_THRESHOLDS.recipientValueRewrite}`,
    "REWRITE",
    "Low actionable value or relevance for the reader",
  ],
  [
    "Intent alignment",
    `< ${POLICY_THRESHOLDS.intentAlignmentRewrite}`,
    "REWRITE",
    "Draft fails to achieve the sender's stated objective",
  ],
  [
    "Addresses request",
    `< ${POLICY_THRESHOLDS.addressesRequestRewrite}`,
    "REWRITE",
    "Fails to answer the preceding conversation context",
  ],
] as const;

export default function MethodPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-foreground selection:text-background">
      {/* Top navigation */}
      <header className="sticky top-0 z-40 w-full border-b border-border/70 bg-background/90 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <Link href="/" className="font-extrabold tracking-tight text-lg hover:opacity-80 transition-opacity">
              HOLD
            </Link>
            <span className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">by AETHER</span>
          </div>

          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="size-3.5" />
            <span>Back to judge</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 flex flex-col gap-10">
        {/* Method Hero */}
        <section className="flex flex-col gap-3">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            <span>Methodology & Architecture</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
            A useful second opinion, with the edges showing.
          </h1>
          <p className="text-base text-muted-foreground leading-relaxed max-w-2xl font-normal">
            HOLD is an open-source pre-send judgment layer. It uses calibrated, typed AI judgments as signals—not as an
            unguided oracle. Your code owns the final call.
          </p>
        </section>

        <Separator />

        {/* Section 1: How HOLD Works */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={FlashIcon} strokeWidth={2} className="size-5 text-foreground" />
            <h2 className="text-xl font-bold tracking-tight">1. How HOLD works</h2>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            When you submit a draft, HOLD makes exactly <strong>one batched request</strong> to TypeSafe Jev. It asks 11
            independent, atomic questions in parallel across the draft, context, and intent. The model returns
            calibrated probabilities and discrete choices, not generated text.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <Card className="bg-card border-border/70">
              <CardHeader className="pb-2">
                <span className="text-xs font-bold text-muted-foreground">STEP 01</span>
                <CardTitle className="text-base">Draft submission</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                The draft and optional audience/intent metadata are sanitized and validated client- and server-side.
              </CardContent>
            </Card>
            <Card className="bg-card border-border/70">
              <CardHeader className="pb-2">
                <span className="text-xs font-bold text-muted-foreground">STEP 02</span>
                <CardTitle className="text-base">Parallel Jev query</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                TypeSafe Jev evaluates 11 atomic dimensions in parallel in a single sub-second roundtrip.
              </CardContent>
            </Card>
            <Card className="bg-card border-border/70">
              <CardHeader className="pb-2">
                <span className="text-xs font-bold text-muted-foreground">STEP 03</span>
                <CardTitle className="text-base">Deterministic policy</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Standard TypeScript code checks calibrated probabilities against versioned policy thresholds.
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Section 2: What Jev Evaluates */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={CpuIcon} strokeWidth={2} className="size-5 text-foreground" />
            <h2 className="text-xl font-bold tracking-tight">2. What Jev evaluates</h2>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            TypeSafe Jev is a System One model trained specifically for fast, calibrated judgments rather than prose
            generation. HOLD consumes three fundamental System One primitives:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
            <Card className="border-border/70">
              <CardHeader className="pb-2">
                <Badge variant="outline" className="w-fit font-mono text-[11px]">
                  Choice
                </Badge>
                <CardTitle className="text-sm pt-1">Categorical selection</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground leading-relaxed">
                Picks one option from a defined set with a full probability distribution and confidence score (e.g.
                recommended action, tone classification).
              </CardContent>
            </Card>
            <Card className="border-border/70">
              <CardHeader className="pb-2">
                <Badge variant="outline" className="w-fit font-mono text-[11px]">
                  Score
                </Badge>
                <CardTitle className="text-sm pt-1">Rubric grading</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground leading-relaxed">
                Evaluates a position on an ordered multi-level rubric, returning a probability-weighted score (e.g.
                clarity, recipient value).
              </CardContent>
            </Card>
            <Card className="border-border/70">
              <CardHeader className="pb-2">
                <Badge variant="outline" className="w-fit font-mono text-[11px]">
                  Noul
                </Badge>
                <CardTitle className="text-sm pt-1">Binary probability</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground leading-relaxed">
                Returns the exact probability that a single proposition is true. Has no separate confidence field (e.g.
                secret exposure, hostility, spam risk).
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Section 3: Deterministic Policy */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={SecurityCheckIcon} strokeWidth={2} className="size-5 text-foreground" />
            <h2 className="text-xl font-bold tracking-tight">3. Deterministic policy</h2>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            AI models should not decide their own rules. In HOLD, the policy engine is pure, testable TypeScript code.
            Verdict evaluation follows strict precedence:
          </p>
          <div className="p-4 rounded-xl border border-border/80 bg-muted/20 flex flex-col gap-2.5 text-xs">
            <div className="flex items-center gap-3">
              <Badge variant="destructive" className="w-20 justify-center">
                BLOCK
              </Badge>
              <span className="text-muted-foreground">
                Highest priority. Triggered by credential exposure or unacceptable interpersonal hostility.
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                variant="outline"
                className="w-20 justify-center text-orange-700 dark:text-orange-400 border-orange-700/30 bg-orange-500/10"
              >
                HOLD
              </Badge>
              <span className="text-muted-foreground">
                Triggered when factual claims require human verification or model confidence is low.
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                variant="outline"
                className="w-20 justify-center text-amber-700 dark:text-amber-400 border-amber-700/30 bg-amber-500/10"
              >
                REWRITE
              </Badge>
              <span className="text-muted-foreground">
                Triggered when clarity, value, intent alignment, or spam risk fail defined communication standards.
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                variant="outline"
                className="w-20 justify-center text-emerald-700 dark:text-emerald-400 border-emerald-700/30 bg-emerald-500/10"
              >
                SEND
              </Badge>
              <span className="text-muted-foreground">
                The draft clears all quality and safety checks without triggering any warning threshold.
              </span>
            </div>
          </div>
        </section>

        {/* Section 4: Thresholds */}
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight">4. Active policy thresholds</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Exact thresholds configured in <code>{POLICY_VERSION}</code> (Question pack:{" "}
              <code>{QUESTION_PACK_VERSION}</code>).
            </p>
          </div>

          <div className="rounded-xl border border-border/80 overflow-hidden bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/40 border-b border-border/80 text-muted-foreground font-semibold">
                  <tr>
                    <th scope="col" className="py-3 px-4">
                      Signal
                    </th>
                    <th scope="col" className="py-3 px-4">
                      Condition
                    </th>
                    <th scope="col" className="py-3 px-4">
                      Verdict
                    </th>
                    <th scope="col" className="py-3 px-4 hidden sm:table-cell">
                      Trigger description
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {thresholdRows.map(([signal, condition, verdict, desc]) => (
                    <tr key={signal} className="hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 px-4 font-medium text-foreground">{signal}</td>
                      <td className="py-2.5 px-4 font-mono text-muted-foreground">{condition}</td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`font-bold ${
                            verdict === "BLOCK"
                              ? "text-destructive"
                              : verdict === "HOLD"
                                ? "text-orange-700 dark:text-orange-400"
                                : "text-amber-700 dark:text-amber-400"
                          }`}
                        >
                          {verdict}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground hidden sm:table-cell">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Section 5: Privacy */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={LockIcon} strokeWidth={2} className="size-5 text-foreground" />
            <h2 className="text-xl font-bold tracking-tight">5. Privacy and data retention</h2>
          </div>
          <Card className="border-border/70 bg-card">
            <CardContent className="pt-5 text-sm text-muted-foreground flex flex-col gap-3">
              <p>
                <strong>Zero retention in HOLD:</strong> HOLD operates statelessly. Drafts and evaluations are handled
                entirely in-memory and are never stored in databases, caches, or logs.
              </p>
              <p>
                <strong>Provider transit:</strong> Evaluations are processed securely through the TypeSafe Jev API.
                Under TypeSafe&apos;s API policies, data sent for inference is not retained for model training. Review
                TypeSafe&apos;s current documentation for enterprise guarantees.
              </p>
            </CardContent>
          </Card>
        </section>

        {/* Section 6: Limitations */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} className="size-5 text-foreground" />
            <h2 className="text-xl font-bold tracking-tight">6. Important limitations</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-muted-foreground">
            <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 flex gap-2.5">
              <HugeiconsIcon
                icon={CheckmarkCircle02Icon}
                strokeWidth={2}
                className="size-4 shrink-0 text-muted-foreground"
              />
              <span>
                <strong>Not a fact checker:</strong> A verification signal highlights statements needing human review;
                it cannot verify external claims itself.
              </span>
            </div>
            <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 flex gap-2.5">
              <HugeiconsIcon
                icon={CheckmarkCircle02Icon}
                strokeWidth={2}
                className="size-4 shrink-0 text-muted-foreground"
              />
              <span>
                <strong>Not legal or compliance advice:</strong> HOLD does not replace legal review, compliance
                screening, or human HR judgment.
              </span>
            </div>
            <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 flex gap-2.5">
              <HugeiconsIcon
                icon={CheckmarkCircle02Icon}
                strokeWidth={2}
                className="size-4 shrink-0 text-muted-foreground"
              />
              <span>
                <strong>Not an AI text detector:</strong> HOLD evaluates the communication quality and risk of text, not
                whether a human or LLM generated it.
              </span>
            </div>
            <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 flex gap-2.5">
              <HugeiconsIcon
                icon={CheckmarkCircle02Icon}
                strokeWidth={2}
                className="size-4 shrink-0 text-muted-foreground"
              />
              <span>
                <strong>Experimental thresholds:</strong> Thresholds should be calibrated to your organization&apos;s
                risk tolerance before production deployment.
              </span>
            </div>
          </div>
        </section>

        {/* Section 7: OSS Contribution Link */}
        <section className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 rounded-xl border border-border/80 bg-muted/30">
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-sm text-foreground">Open source & community</span>
            <span className="text-xs text-muted-foreground">
              HOLD is licensed under Apache 2.0. Contributions, question-pack improvements, and policy tuning are
              welcome.
            </span>
          </div>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "outline", size: "sm", className: "h-9 shrink-0 gap-1.5" })}
          >
            <span>GitHub Repository</span>
            <HugeiconsIcon icon={ArrowUpRight01Icon} strokeWidth={2} className="size-3.5" />
          </a>
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-border/60 py-6 mt-12 bg-background/50 text-xs text-muted-foreground">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">HOLD</span>
            <span>by AETHER</span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://docs.typesafe.ai/models.md"
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground transition-colors inline-flex items-center gap-1"
            >
              <span>TypeSafe pricing & models</span>
              <HugeiconsIcon icon={ArrowUpRight01Icon} strokeWidth={2} className="size-3" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
