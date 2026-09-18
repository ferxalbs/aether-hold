import { ArrowLeft, ArrowUpRight, Check, CircleHelp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { POLICY_THRESHOLDS, POLICY_VERSION } from "@/packages/policy-engine";
import { QUESTION_PACK_VERSION } from "@/packages/question-packs";

export const metadata: Metadata = {
  title: "Method — HOLD by AETHER",
  description: "How HOLD combines TypeSafe Jev judgments with deterministic policy.",
};

const thresholdRows = [
  ["Secret exposure", `≥ ${POLICY_THRESHOLDS.secretExposureBlock}`, "BLOCK"],
  ["Hostility", `≥ ${POLICY_THRESHOLDS.hostilityBlock}`, "BLOCK"],
  ["Needs verification", `≥ ${POLICY_THRESHOLDS.needsVerificationHold}`, "HOLD"],
  ["Recommended action confidence", `< ${POLICY_THRESHOLDS.recommendedActionConfidenceHold}`, "HOLD"],
  ["Spam risk", `≥ ${POLICY_THRESHOLDS.spamRiskRewrite}`, "REWRITE"],
  ["Clarity (normalized)", `< ${POLICY_THRESHOLDS.clarityRewrite}`, "REWRITE"],
  ["Recipient value (normalized)", `< ${POLICY_THRESHOLDS.recipientValueRewrite}`, "REWRITE"],
  ["Intent alignment", `< ${POLICY_THRESHOLDS.intentAlignmentRewrite}`, "REWRITE"],
  ["Addresses request", `< ${POLICY_THRESHOLDS.addressesRequestRewrite}`, "REWRITE"],
];

export default function MethodPage() {
  return (
    <main className="method-page site-shell">
      <header className="topbar">
        <Link className="wordmark" href="/" aria-label="HOLD home">
          <span>HOLD</span>
          <small>BY AETHER</small>
        </Link>
        <Link className="method-back" href="/">
          <ArrowLeft size={15} aria-hidden="true" /> Back to judge
        </Link>
      </header>
      <section className="method-hero">
        <p className="section-kicker">THE METHOD</p>
        <h1>
          A useful second opinion,
          <br />
          <em>with the edges showing.</em>
        </h1>
        <p>
          HOLD is an open-source experiment in using typed AI judgments as signals—not as an oracle. The code owns the
          final call.
        </p>
      </section>

      <section className="method-grid">
        <article className="method-card">
          <span className="method-index">01</span>
          <h2>Jev returns judgments, not prose.</h2>
          <p>
            Every evaluation sends one request to TypeSafe Jev with a small set of independent questions. Jev does not
            rewrite the draft or generate an explanation.
          </p>
          <div className="primitive-list">
            <div>
              <b>Choice</b>
              <span>One option from a defined set, with a selected label, probabilities, and confidence.</span>
            </div>
            <div>
              <b>Score</b>
              <span>A position on an ordered rubric, with a weighted score, probabilities, and confidence.</span>
            </div>
            <div>
              <b>Noul</b>
              <span>
                The probability that a single yes/no statement is true. Noul has no separate confidence field.
              </span>
            </div>
          </div>
        </article>
        <article className="method-card">
          <span className="method-index">02</span>
          <h2>Policy is ordinary TypeScript.</h2>
          <p>
            HOLD normalizes the returned signals and applies explicit, versioned thresholds. Precedence is BLOCK, then
            HOLD, then REWRITE, then SEND.
          </p>
          <div className="method-callout">
            <CircleHelp size={17} aria-hidden="true" />
            <span>Typed output guarantees the shape of a judgment, not that the judgment is factually correct.</span>
          </div>
        </article>
      </section>

      <section className="threshold-section">
        <div>
          <p className="section-kicker">ACTIVE POLICY</p>
          <h2>Experimental thresholds</h2>
          <p>
            These values are a starting point for testing, not universal truth. They are included in every result so a
            reviewer can see which policy made the call.
          </p>
        </div>
        <table className="threshold-table" aria-label="HOLD policy thresholds">
          <thead>
            <tr className="threshold-row threshold-head">
              <th scope="col">Signal</th>
              <th scope="col">Threshold</th>
              <th scope="col">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {thresholdRows.map(([name, threshold, verdict]) => (
              <tr className="threshold-row" key={name}>
                <td>{name}</td>
                <td>
                  <code>{threshold}</code>
                </td>
                <td>
                  <strong data-threshold-verdict={verdict}>{verdict}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="method-notes">
        <div>
          <p className="section-kicker">LIMITS TO KEEP IN VIEW</p>
          <h2>HOLD can be wrong.</h2>
        </div>
        <div className="notes-list">
          <p>
            <Check size={16} aria-hidden="true" />
            HOLD is not a fact checker. A verification signal says a human should check a claim; it does not check the
            claim.
          </p>
          <p>
            <Check size={16} aria-hidden="true" />
            HOLD is not a legal reviewer, security boundary, or AI-text detector. It never tries to determine whether a
            person or model wrote a draft.
          </p>
          <p>
            <Check size={16} aria-hidden="true" />
            Consequential communication still needs human review. The policy is experimental and should be evaluated
            against your own cases.
          </p>
          <p>
            <Check size={16} aria-hidden="true" />
            Drafts are not stored by HOLD. Submitted text is sent to TypeSafe for evaluation; review TypeSafe&apos;s
            current terms and privacy documentation before a public deployment.
          </p>
        </div>
      </section>

      <section className="method-meta">
        <div>
          <span>Question pack</span>
          <strong>{QUESTION_PACK_VERSION}</strong>
        </div>
        <div>
          <span>Policy</span>
          <strong>{POLICY_VERSION}</strong>
        </div>
        <div>
          <span>Provider</span>
          <strong>TypeSafe Jev / fake local mode</strong>
        </div>
      </section>
      <footer className="site-footer">
        <span>HOLD by AETHER</span>
        <span>Open source pre-send judgment layer</span>
        <a href="https://docs.typesafe.ai/models.md" target="_blank" rel="noreferrer">
          TypeSafe model pricing <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </footer>
    </main>
  );
}
