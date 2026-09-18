# HOLD calibration report

Fixture: `hold-calibration-v1`

The fixture contains 30 synthetic drafts with human expected labels kept separate from model output. It has 10 email, 10 social-post, and 10 support-reply cases, with human labels distributed as 8 SEND, 8 REWRITE, 7 HOLD, and 7 BLOCK.

## Live run status

Pending live Jev execution. Run `bun run test:live-jev` with `TYPESAFE_API_KEY` configured and `HOLD_PROVIDER=typesafe` (or unset) to write the machine-readable result artifact at `calibration/live-jev-smoke.latest.json` and replace this section with measured results.

The current environment did not provide `TYPESAFE_API_KEY`, so agreement, disagreement, and uncertainty cannot be computed without inventing model outputs. Until the live run is completed, all 30 calibration cases are **uncertain/pending**, and the production-readiness decision must remain **not ready** for live verification.

| Category | Count | Status |
| --- | ---: | --- |
| Agreement | 0 | Not measured |
| Disagreement | 0 | Not measured |
| Uncertain | 30 | Pending live Jev output |

The live runner records normalized signals, Choice/Score confidence, Noul probabilities, deterministic policy reasons, verdict, latency, input/output token usage, estimated input cost, model identifier, and the per-case Jev request count for both the seven smoke cases and the 30 calibration cases. It does not change human labels or tune thresholds automatically.
