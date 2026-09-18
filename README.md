# HOLD by AETHER

> AI writes. HOLD decides if it should be sent.

HOLD is an open-source, pre-send judgment layer powered by TypeSafe Jev. Paste a draft, choose its context, and get a typed `SEND`, `REWRITE`, `HOLD`, or `BLOCK` verdict with inspectable signals. HOLD does not generate or rewrite text.

![HOLD interface placeholder](https://placehold.co/1200x700/f4f2ee/171717?text=HOLD+by+AETHER)

## What is included

- Exactly three contexts: social posts, emails, and support replies.
- One TypeSafe Jev request per evaluation, with atomic Choice, Score, and Noul questions evaluated in parallel.
- A deterministic, versioned policy in ordinary TypeScript with explicit threshold reason codes.
- Fake-provider mode for local development and automated tests when no API key is present.
- A draft-free verdict card that downloads as PNG (with SVG fallback).
- A transparency page at `/method` describing the primitives, thresholds, privacy behavior, and limitations.

## Architecture

```text
app/hold-client.tsx       interactive form, result view, share card download
app/api/evaluate/route.ts server-only validation and orchestration boundary
packages/core             HoldInput, provider signals, normalized results
packages/question-packs   versioned context-aware question definitions
packages/jev-provider     the only module that imports @typesafe-ai/sdk
packages/policy-engine    deterministic thresholds and reason codes
lib/                      server evaluation, pricing, optional Upstash limiter
```

The browser never receives `TYPESAFE_API_KEY`. Drafts are validated, sent to the provider for the evaluation, and then discarded; HOLD does not persist or log drafts, results, conversation context, or raw IP addresses. If you configure Upstash rate limiting, HOLD sends a short-lived hash of the request address as a limiter key rather than the raw address.

## Local setup

Requirements: Bun 1.4+ and Node.js 20+ (the TypeSafe SDK runtime requirement).

```bash
bun install
cp .env.example .env.local
bun run dev
```

Open [http://localhost:3000](http://localhost:3000). With no `TYPESAFE_API_KEY`, the app uses the deterministic fake provider. The examples are designed to reach `REWRITE`, `BLOCK`, and `HOLD`; a clear professional draft reaches `SEND`.

### Environment variables

Required for a real Jev run:

```bash
TYPESAFE_API_KEY=ts_...
TYPESAFE_DEFAULT_MODEL=jev-latest
HOLD_PROVIDER=typesafe
```

Optional public-deployment protection:

```bash
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
HOLD_RATE_LIMIT_REQUESTS=30
HOLD_RATE_LIMIT_WINDOW_SECONDS=60
HOLD_RATE_LIMIT_SALT=long-random-secret
```

If the Upstash variables are absent, local evaluation continues to work. A public production deployment should configure rate limiting before exposure. The rate limiter is a small REST pipeline using `INCR` and `EXPIRE`; it fails closed if a configured service is unavailable.

Fake-mode controls are useful for browser checks:

```bash
HOLD_PROVIDER=fake
HOLD_FAKE_FAILURE=1       # make the provider return a safe retryable error
HOLD_FAKE_DELAY_MS=10000  # exercise the timeout path
```

## TypeSafe setup and cost estimate

`packages/jev-provider` creates `TypeSafeClient` on the server and makes one `systemOne` call with the full question pack. The current Jev model page documents input-only pricing of `$42 / Btok` (`$0.042 / Mtok`); `lib/pricing.ts` uses that documented input price and labels the result as an estimate. Fake mode reports `$0.00 est.`.

## Checks

```bash
bun run typecheck
bun run lint
bun run lint:biome
bun test
bun run build
bun run test:e2e
```

Playwright starts the local dev server automatically. Install a browser once if needed:

```bash
bunx playwright install chromium
```

## Deploying to Vercel

1. Import the repository into Vercel with the Next.js preset.
2. Set `TYPESAFE_API_KEY`, `TYPESAFE_DEFAULT_MODEL`, and `HOLD_PROVIDER=typesafe` in the production environment.
3. Configure the Upstash REST variables and a random `HOLD_RATE_LIMIT_SALT` before making the URL public.
4. Deploy with the default build command (`bun run build` or the Vercel Next.js build preset).

No deployment, external account, package publication, or API key is part of this repository change.

## Privacy and limitations

Submitted text is sent to TypeSafe for evaluation. HOLD does not store drafts, results, IP addresses, or context and does not put draft content in URLs, metadata, filenames, or analytics. HOLD is not a fact checker, legal reviewer, security boundary, or AI-text detector. A `HOLD` signal means a person should check; it does not prove a claim is false or true. The policy thresholds are experimental and consequential communication still needs human review.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the question-pack and fixture workflow. Changes should keep the provider replaceable and add representative fixtures when a question meaning or policy threshold changes.

## License

HOLD by AETHER is released under the [Apache License 2.0](./LICENSE).
