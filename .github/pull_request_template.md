## Summary

- What changed?
- Which user-visible or policy behavior is affected?

## Verification

- [ ] `bun install --frozen-lockfile`
- [ ] `bun run typecheck`
- [ ] `bun run lint`
- [ ] `bun run lint:biome`
- [ ] `bun test`
- [ ] `bun run build`
- [ ] Relevant browser checks

## Safety and privacy

- [ ] No credentials, private drafts, or provider response bodies are included.
- [ ] No draft or query is written to logs, URLs, metadata, or filenames.
- [ ] Any question-pack or policy change includes an independently labeled test/fixture update.

