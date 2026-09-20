# Contributing to HOLD

## Development loop

```bash
bun install
bun run dev
bun test
bun run typecheck
bun run lint
bun run build
bun run test:e2e
```

Use fake-provider mode for tests and local UI work by explicitly setting `HOLD_PROVIDER=fake`; never rely on a missing key to select it. Never commit an API key or a real draft in a fixture.

## Adding or changing a question pack

1. Update the version in `packages/question-packs/index.ts` whenever the meaning, rubric, or set of questions changes.
2. Keep each question atomic and put definitions in `packages/question-packs`; API routes must not contain question definitions.
3. Use `Choice` for one closed-set answer, `Score` for an ordered rubric, and `Noul` for a single yes/no probability. Do not treat a Noul probability as confidence.
4. Add or update deterministic fixtures in `tests/` that cover the changed signal and the final policy outcome.
5. Keep the policy decision in `packages/policy-engine`; do not ask Jev to generate explanations or decide thresholds.
6. Run the full required checks before opening a pull request.

## Evidence and live verification

Evidence is an explicit second-stage operation. Keep claim selection bounded, preserve the original sentence text, validate source URLs, and never generate a source summary. Use `bun run test:live-jev` and `bun run test:live-evidence` only with authorized real provider credentials; ordinary local runs intentionally skip both live suites.

## Privacy rules

Do not log or persist submitted drafts, conversation context, results, or raw request addresses. Keep the TypeSafe key in server-only modules and environment variables. Review any new dependency or public API change before adding it.
