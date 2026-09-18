"use client";

import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  Download,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  EvaluationErrorResponse,
  EvaluationResponse,
  HoldContext,
  HoldInput,
  NormalizedSignal,
  Verdict,
} from "@/packages/core";
import { holdInputSchema } from "@/packages/core";

const examples: Array<{
  label: string;
  context: HoldContext;
  draft: string;
  intent?: string;
  audience?: string;
  conversationContext?: string;
}> = [
  {
    label: "Aggressive sales email",
    context: "email",
    audience: "A founder who has not replied to our last email",
    intent: "Start a useful conversation without pressure",
    draft:
      "You clearly don't understand what you're missing. This is your last chance to buy before the price doubles. Click here now or accept that your team will fall behind.",
  },
  {
    label: "Vague social post",
    context: "social-post",
    audience: "People who follow our studio",
    draft: "Big things coming. Excited for what's next. More soon 👀",
  },
  {
    label: "Frustrated support reply",
    context: "support-reply",
    intent: "Resolve the customer's login issue and rebuild trust",
    conversationContext:
      "The customer says they have been locked out since the update and asks when access will be restored.",
    draft:
      "We already told you this is being worked on. Please stop sending the same message. It's not our fault you can't follow basic instructions.",
  },
];

const verdictMeta: Record<Verdict, { title: string; description: string; action: string }> = {
  SEND: { title: "Ready to send", description: "The draft clears the current experimental checks.", action: "Send" },
  REWRITE: {
    title: "Rewrite before sending",
    description: "A meaningful writing or fit problem is visible in the draft.",
    action: "Rewrite",
  },
  HOLD: {
    title: "Hold for a human check",
    description: "There is uncertainty or a claim worth checking before it goes out.",
    action: "Hold",
  },
  BLOCK: {
    title: "Do not send",
    description: "The draft crosses a serious privacy or interpersonal safety threshold.",
    action: "Block",
  },
};

const signalOrder = [
  "clarity",
  "recipientValue",
  "tone",
  "perceivedIntent",
  "spamRisk",
  "needsVerification",
  "secretExposure",
  "hostility",
  "addressesRequest",
  "intentAlignment",
];

function formatCost(value: number | null): string {
  if (value === null) return "Not available";
  if (value === 0) return "$0.00 est.";
  return `$${value.toFixed(4)} est.`;
}

function escapeXml(value: string): string {
  return value.replace(
    /[<>&'"]/g,
    (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[character] ?? character,
  );
}

function getCardSignals(result: EvaluationResponse): NormalizedSignal[] {
  const byId = new Map(result.signals.map((signal) => [signal.id, signal]));
  return signalOrder
    .map((id) => byId.get(id))
    .filter((signal): signal is NormalizedSignal => Boolean(signal))
    .slice(0, 5);
}

function buildCardSvg(result: EvaluationResponse): string {
  const accent = { SEND: "#3f7355", REWRITE: "#a66a12", HOLD: "#b64d17", BLOCK: "#b33a3a" }[result.verdict];
  const rows = getCardSignals(result)
    .map((signal, index) => {
      const y = 346 + index * 52;
      const width = Math.max(3, Math.round(signal.value * 352));
      return `<text x="82" y="${y}" fill="#737373" font-family="Arial, sans-serif" font-size="16">${escapeXml(signal.label)}</text><text x="438" y="${y}" fill="#171717" text-anchor="end" font-family="Arial, sans-serif" font-size="16" font-weight="700">${escapeXml(signal.displayValue)}</text><rect x="82" y="${y + 12}" width="352" height="8" rx="4" fill="#e7e5e4"/><rect x="82" y="${y + 12}" width="${width}" height="8" rx="4" fill="${accent}"/>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="920" viewBox="0 0 1200 920"><rect width="1200" height="920" fill="#fafaf9"/><rect x="48" y="48" width="1104" height="824" rx="32" fill="#ffffff" stroke="#e7e5e4"/><text x="82" y="112" fill="#171717" font-family="Arial, sans-serif" font-size="26" font-weight="800" letter-spacing="3">HOLD</text><text x="82" y="138" fill="#a3a3a3" font-family="Arial, sans-serif" font-size="14" letter-spacing="2">BY AETHER</text><text x="82" y="224" fill="#171717" font-family="Arial, sans-serif" font-size="76" font-weight="800">${escapeXml(result.verdict)}</text><circle cx="1036" cy="220" r="30" fill="${accent}"/><path d="M1020 220l11 11 22-25" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><text x="82" y="274" fill="#737373" font-family="Arial, sans-serif" font-size="20">AI writes. HOLD decides if it should be sent.</text>${rows}<line x1="82" y1="706" x2="1118" y2="706" stroke="#e7e5e4"/><text x="82" y="752" fill="#737373" font-family="Arial, sans-serif" font-size="16">${result.latencyMs} ms  ·  ${escapeXml(formatCost(result.estimatedCostUsd))}  ·  ${escapeXml(result.policyVersion)}</text><text x="82" y="794" fill="#a3a3a3" font-family="Arial, sans-serif" font-size="15">Powered by TypeSafe Jev  ·  Experimental policy</text></svg>`;
}

async function downloadVerdictCard(result: EvaluationResponse): Promise<void> {
  const svg = buildCardSvg(result);
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);

  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 920;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    context.drawImage(image, 0, 0);
    const png = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("Could not create image"))), "image/png"),
    );
    const downloadUrl = URL.createObjectURL(png);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = `hold-${result.verdict.toLowerCase()}-card.png`;
    anchor.click();
    URL.revokeObjectURL(downloadUrl);
  } catch {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `hold-${result.verdict.toLowerCase()}-card.svg`;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function SignalBars({ signals }: { signals: NormalizedSignal[] }) {
  return (
    <section className="signal-grid" aria-label="Judgment signals">
      {signals.map((signal) => (
        <div className="signal-row" key={signal.id}>
          <div className="signal-heading">
            <span>{signal.label}</span>
            <span className="signal-value">{signal.displayValue}</span>
          </div>
          <div className="signal-track" aria-hidden="true">
            <div className="signal-fill" style={{ width: `${Math.round(signal.value * 100)}%` }} />
          </div>
        </div>
      ))}
    </section>
  );
}

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
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    document.getElementById("draft")?.setAttribute("data-hydrated", "true");
  }, []);

  const currentSignals = useMemo(() => {
    if (!result) return [];
    const byId = new Map(result.signals.map((signal) => [signal.id, signal]));
    return signalOrder
      .map((id) => byId.get(id))
      .filter((signal): signal is NormalizedSignal => Boolean(signal))
      .slice(0, 6);
  }, [result]);

  function chooseExample(example: (typeof examples)[number]) {
    setContext(example.context);
    setDraft(example.draft);
    setAudience(example.audience ?? "");
    setIntent(example.intent ?? "");
    setConversationContext(example.conversationContext ?? "");
    setShowOptions(Boolean(example.audience || example.intent || example.conversationContext));
    setResult(null);
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setCopied(false);

    const payload: HoldInput = {
      draft,
      context,
      ...(audience.trim() ? { audience: audience.trim() } : {}),
      ...(intent.trim() ? { intent: intent.trim() } : {}),
      ...(conversationContext.trim() ? { conversationContext: conversationContext.trim() } : {}),
    };
    const parsed = holdInputSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Check the draft and try again.");
      return;
    }

    setIsLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
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

  async function copyVerdict() {
    if (!result) return;
    const text = `HOLD verdict: ${result.verdict}\n${result.reasonLabels.join(" · ")}\n${result.latencyMs} ms · ${formatCost(result.estimatedCostUsd)}\n${result.policyVersion}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Copy is unavailable in this browser. You can still download the card.");
    }
  }

  function tryAnother() {
    setResult(null);
    setError(null);
    setCopied(false);
    setDraft("");
    setAudience("");
    setIntent("");
    setConversationContext("");
    setShowOptions(false);
  }

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="wordmark" href="#judge" aria-label="HOLD home">
          <span>HOLD</span>
          <small>BY AETHER</small>
        </a>
        <nav className="topnav" aria-label="Primary navigation">
          <a href="#how-it-works">How it works</a>
          <a href="/method">Method</a>
          <a className="github-link" href="https://github.com" target="_blank" rel="noreferrer">
            Open source <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </nav>
      </header>

      <section className="hero" id="judge">
        <div className="eyebrow">
          <span className="eyebrow-dot" /> PRE-SEND JUDGMENT LAYER
        </div>
        <h1>
          AI writes.
          <br />
          <em>HOLD</em> decides if it should be sent.
        </h1>
        <p className="hero-copy">
          A calm, inspectable second opinion for the message you are about to put into the world.
        </p>
      </section>

      <section className="judge-layout" aria-label="Judge a draft">
        <div className="compose-panel panel">
          <div className="panel-topline">
            <span>01 / DRAFT</span>
            <span className="privacy-note">
              <ShieldCheck size={14} aria-hidden="true" /> Nothing is stored
            </span>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="field-group">
              <label htmlFor="context">What are you sending?</label>
              <select id="context" value={context} onChange={(event) => setContext(event.target.value as HoldContext)}>
                <option value="email">Email</option>
                <option value="social-post">Social post</option>
                <option value="support-reply">Support reply</option>
              </select>
            </div>
            <div className="field-group draft-field">
              <label htmlFor="draft">
                Your draft <span className="required-mark">Required</span>
              </label>
              <textarea
                id="draft"
                data-hydrated="false"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={8000}
                placeholder="Paste what you are about to send…"
                rows={9}
                aria-describedby="draft-help"
              />
              <div className="field-foot" id="draft-help">
                <span>Keep the words yours. HOLD only judges them.</span>
                <span>{draft.length.toLocaleString()} / 8,000</span>
              </div>
            </div>
            <button
              className="context-toggle"
              type="button"
              onClick={() => setShowOptions((value) => !value)}
              aria-expanded={showOptions}
            >
              <span>
                <span className="plus-mark">{showOptions ? "−" : "+"}</span> Add context <small>optional</small>
              </span>
              <ChevronDown size={17} aria-hidden="true" className={showOptions ? "chevron-open" : ""} />
            </button>
            {showOptions ? (
              <div className="optional-fields">
                <div className="field-group">
                  <label htmlFor="audience">
                    Audience <small>Who will read it?</small>
                  </label>
                  <input
                    id="audience"
                    value={audience}
                    onChange={(event) => setAudience(event.target.value)}
                    maxLength={2000}
                    placeholder="e.g. My team, public followers"
                  />
                </div>
                <div className="field-group">
                  <label htmlFor="intent">
                    Intent <small>What should it accomplish?</small>
                  </label>
                  <input
                    id="intent"
                    value={intent}
                    onChange={(event) => setIntent(event.target.value)}
                    maxLength={2000}
                    placeholder="e.g. Ask for a clear decision"
                  />
                </div>
                <div className="field-group">
                  <label htmlFor="conversation">
                    Conversation context <small>What came before?</small>
                  </label>
                  <textarea
                    id="conversation"
                    value={conversationContext}
                    onChange={(event) => setConversationContext(event.target.value)}
                    maxLength={2000}
                    rows={3}
                    placeholder="Paste the relevant request or thread context"
                  />
                </div>
              </div>
            ) : null}
            {error ? (
              <div className="form-error" role="alert">
                {error}
              </div>
            ) : null}
            <button className="primary-action" type="submit" disabled={isLoading || !draft.trim()}>
              {isLoading ? (
                <>
                  <LoaderCircle size={18} className="spin" aria-hidden="true" /> Judging your draft…
                </>
              ) : (
                <>
                  Judge before sending <ArrowUpRight size={18} aria-hidden="true" />
                </>
              )}
            </button>
          </form>
        </div>

        <div
          className={`result-panel panel ${isLoading ? "is-loading" : ""} ${result ? "has-result" : ""}`}
          aria-live="polite"
          aria-busy={isLoading}
        >
          {!result && !isLoading ? (
            <div className="empty-result">
              <div className="empty-glyph">
                <Sparkles size={20} aria-hidden="true" />
              </div>
              <p className="empty-kicker">02 / VERDICT</p>
              <h2>Your judgment will land here.</h2>
              <p>One request. Typed signals. A decision you can inspect before you hit send.</p>
            </div>
          ) : null}
          {isLoading ? (
            <div className="loading-result" role="status">
              <div className="loading-pulse" />
              <p className="empty-kicker">02 / VERDICT</p>
              <h2>Reading the room…</h2>
              <p>Jev is checking the draft across a few focused dimensions.</p>
              <div className="loading-lines">
                <span />
                <span />
                <span />
              </div>
            </div>
          ) : null}
          {result ? (
            <div className="result-content" data-verdict={result.verdict}>
              <div className="panel-topline">
                <span>02 / VERDICT</span>
                <span className="experimental-tag">Experimental policy</span>
              </div>
              <div className="verdict-lockup">
                <div>
                  <p className="verdict-overline">HOLD SAYS</p>
                  <h2>{result.verdict}</h2>
                </div>
                <div className="verdict-stamp" role="img" aria-label={verdictMeta[result.verdict].title}>
                  {result.verdict === "SEND" ? (
                    <Check size={28} aria-hidden="true" />
                  ) : result.verdict === "BLOCK" ? (
                    "!"
                  ) : (
                    "—"
                  )}
                </div>
              </div>
              <p className="verdict-description">{verdictMeta[result.verdict].description}</p>
              {result.reasonLabels.length ? (
                <div className="reason-list">
                  <p className="reason-title">Why</p>
                  {result.reasonLabels.map((label) => (
                    <span className="reason-chip" key={label}>
                      {label}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="reason-clear">
                  <Check size={15} aria-hidden="true" /> No threshold was triggered.
                </p>
              )}
              <SignalBars signals={currentSignals} />
              <div className="result-meta">
                <span>
                  <strong>{result.latencyMs} ms</strong> latency
                </span>
                <span>
                  <strong>{formatCost(result.estimatedCostUsd)}</strong> cost
                </span>
                <span>
                  <strong>{result.model}</strong> model
                </span>
              </div>
              <div className="result-actions">
                <button type="button" onClick={copyVerdict}>
                  {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}{" "}
                  {copied ? "Copied" : "Copy verdict"}
                </button>
                <button type="button" onClick={() => void downloadVerdictCard(result)}>
                  <Download size={16} aria-hidden="true" /> Download card
                </button>
                <button type="button" className="text-action" onClick={tryAnother}>
                  <RotateCcw size={16} aria-hidden="true" /> Try another
                </button>
              </div>
              <div className="card-preview" role="img" aria-label="Shareable verdict card preview">
                <div className="card-preview-brand">
                  HOLD <span>BY AETHER</span>
                </div>
                <div className="card-preview-verdict">{result.verdict}</div>
                <div className="card-preview-signals">
                  {getCardSignals(result)
                    .slice(0, 4)
                    .map((signal) => (
                      <span key={signal.id}>
                        {signal.label} <b>{signal.displayValue}</b>
                      </span>
                    ))}
                </div>
                <div className="card-preview-footer">
                  {result.latencyMs} ms · {formatCost(result.estimatedCostUsd)} · Powered by TypeSafe Jev
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="examples-section" aria-labelledby="examples-heading">
        <div>
          <p className="section-kicker">TRY A SCENARIO</p>
          <h2 id="examples-heading">See how the signal changes.</h2>
        </div>
        <div className="examples-grid">
          {examples.map((example, index) => (
            <button type="button" className="example-card" key={example.label} onClick={() => chooseExample(example)}>
              <span className="example-number">0{index + 1}</span>
              <span className="example-label">{example.label}</span>
              <span className="example-context">{example.context.replace("-", " ")}</span>
              <ArrowUpRight size={17} aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>
      <section className="how-section" id="how-it-works">
        <div className="how-intro">
          <p className="section-kicker">A SMALLER AI LOOP</p>
          <h2>
            Code owns the call.
            <br />
            Jev supplies the judgment.
          </h2>
        </div>
        <div className="how-steps">
          <div>
            <span>01</span>
            <h3>One request</h3>
            <p>Atomic questions run together over the same draft, so the result stays fast and inspectable.</p>
          </div>
          <div>
            <span>02</span>
            <h3>Typed signals</h3>
            <p>Choice, Score, and Noul return probabilities your product can reason about directly.</p>
          </div>
          <div>
            <span>03</span>
            <h3>Deterministic policy</h3>
            <p>Thresholds live in ordinary TypeScript. HOLD never asks a model to decide its own policy.</p>
          </div>
        </div>
      </section>
      <footer className="site-footer">
        <span>HOLD by AETHER</span>
        <span>Open source pre-send judgment layer</span>
        <a href="/method">
          Read the method <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </footer>
    </main>
  );
}
