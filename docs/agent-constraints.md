# Agent constraints (learning edge)

Rules derived from accepted results. The splitter reads this file before it writes a plan, and
`node scripts/agent-plan.mjs brief <plan> <unit>` copies the matching rules into each worker brief.
The gate lists the rules whose scope matches a PR's files.

How to add one:
- Add an entry only after a result is accepted (merged, or confirmed on a device by Nam).
- One rule per entry. Store the constraint, not the output.
- `source` must name the commit or PR that confirmed it. Entries without one fail
  `node scripts/agent-plan.mjs constraints`.
- `scope` is a comma-separated list of repo globs. Use `**` only for repo-wide rules.

Format:

```
### C<n> Short title
- scope: glob, glob
- rule: one sentence
- source: commit hash or #PR
- added: YYYY-MM-DD
```

## Entries

### C1 Echo changes are gated on numbers and a real iPhone
- scope: mingle-app/rn/ios/**/*Echo*, mingle-app/rn/ios/**/*Translation*
- rule: A change to TTS echo removal must report the simulated echo suppression in dB and be confirmed on a real iPhone; do not pause STT while TTS plays and do not drop transcripts that repeat the translation.
- source: e7cebf58, e6327151
- added: 2026-10-31

### C2 Operator accounts never show an operator mark to users
- scope: mingle-app/src/components/**, mingle-app/src/app/[locale]/**, mingle-app/src/server/**, mingle-app/src/lib/**
- rule: No operator badge, label or notice on any user-facing surface; labels inside the admin tool are allowed.
- source: #404
- added: 2026-10-31

### C3 Native banner only on plain list and chat screens
- scope: mingle-app/rn/**, mingle-app/src/components/**
- rule: Show the native banner only on the conversation list tab and inside chat rooms with no menu, search, notification or sort sheet open, and never during onboarding.
- source: 0c9877e2, 4b47abdc
- added: 2026-10-31
