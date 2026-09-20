# Security policy

HOLD is an open-source pre-send judgment layer. It is not a security boundary, a secret manager, or a substitute for a human review of consequential communication.

## Reporting a vulnerability

Please do not open a public issue for a security vulnerability. Use GitHub's private security advisory flow for the canonical repository, or contact the maintainers privately with a minimal reproduction and affected version. Do not include real credentials, private communications, or personal data.

## Security properties

- TypeSafe credentials are read only in server-side modules and are never sent to browser bundles.
- Production rejects the fake provider and requires explicit TypeSafe credentials.
- Production configuration requires a rate limiter, a non-default hashing salt, and an explicit spending ceiling.
- Drafts, claims, search queries, provider response bodies, and raw addresses are not logged or persisted by HOLD.
- Search results are validated to HTTP(S) URLs and provider HTML is never rendered.
- Evidence is an inspectable source-retrieval aid; it does not prove a claim true or false.
- Next response headers include CSP, frame denial, MIME sniffing protection, referrer restrictions, and restrictive permissions.
- The spending guard is server-side and process-local; a distributed deployment should pair it with a shared budget control before public exposure.

If you find a way to bypass these properties, please include the request path, expected behavior, observed behavior, and whether the issue can expose user text or credentials.
