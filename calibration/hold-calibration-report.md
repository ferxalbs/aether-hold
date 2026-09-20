# HOLD calibration report

Fixture: `hold-calibration-v2`

Live TypeSafe Jev run generated at 2026-09-19T07:48:19.565Z. Human expected labels come from the versioned fixture and are not overwritten by model output.

| Category | Count |
| --- | ---: |
| Agreement | 56 |
| Disagreement | 4 |
| Uncertain cases | 46 |
| Overall agreement | 93.3% |
| Critical BLOCK false negatives | 0 |
| p50 latency | 270 ms |
| p95 latency | 314 ms |
| Average input tokens | 1672 |
| Maximum input tokens | 1751 |
| Average output tokens | 235 |
| Maximum output tokens | 248 |
| Average estimated cost | $0.000070 |
| Maximum estimated cost | $0.000074 |

## Model verdict distribution

| Verdict | Count |
| --- | ---: |
| SEND | 17 |
| REWRITE | 16 |
| HOLD | 15 |
| BLOCK | 12 |

## Agreement by human-expected verdict

| Expected verdict | Agreement | Cases | Agreement rate |
| --- | ---: | ---: | ---: |
| SEND | 17 | 19 | 89.5% |
| REWRITE | 15 | 17 | 88.2% |
| HOLD | 12 | 12 | 100.0% |
| BLOCK | 12 | 12 | 100.0% |

## Gate metadata

- Models: jev-1.13.0
- Requested model: jev-latest
- Question pack: hold-questions-2.0.0-atomic
- Policy: hold-policy-2.0.0-atomic
- One Jev request per communication evaluation: yes

## Confusion matrix

```json
{
  "SEND": {
    "SEND": 17,
    "REWRITE": 1,
    "HOLD": 1,
    "BLOCK": 0
  },
  "REWRITE": {
    "SEND": 0,
    "REWRITE": 15,
    "HOLD": 2,
    "BLOCK": 0
  },
  "HOLD": {
    "SEND": 0,
    "REWRITE": 0,
    "HOLD": 12,
    "BLOCK": 0
  },
  "BLOCK": {
    "SEND": 0,
    "REWRITE": 0,
    "HOLD": 0,
    "BLOCK": 12
  }
}
```

## Review queue

- Disagreement IDs: email-send-02, social-rewrite-02, support-send-02, support-rewrite-02
- Uncertain case IDs: email-send-02, email-send-03, email-rewrite-01, email-rewrite-02, email-rewrite-03, email-hold-01, email-block-01, email-block-02, social-send-01, social-send-02, social-send-03, social-rewrite-02, social-hold-01, social-hold-02, social-block-01, social-block-02, support-send-02, support-rewrite-02, support-hold-01, support-hold-03, support-block-01, support-block-03, email-send-04, email-send-05, email-send-06, email-send-07, email-rewrite-06, email-hold-04, email-block-03, social-send-04, social-send-05, social-send-06, social-send-07, social-rewrite-04, social-rewrite-05, social-hold-03, social-block-03, social-block-04, social-block-05, support-send-04, support-rewrite-04, support-rewrite-05, support-rewrite-06, support-hold-04, support-hold-05, support-block-04

The full disagreement and uncertainty records are preserved in `calibration/live-jev-smoke.latest.json` for review. No thresholds were tuned by this run.
