# Presentation Author Skill

Operational instructions for Router Agent and Slide Agent to handle
PowerPoint / PPTX generation requests.

## Design

- **Skill target**: primarily for Slide Agent / Presentation Agent
- **Router Agent**: receives only `references/router-handoff.md` — a compact
  summary of when to delegate and how to present results
- **Slide Agent**: receives the full guidance set (slide-agent-guidance,
  font-policy, artifact-response, diagnostics-revision)

## Structure

```
skills/presentation-author/
  SKILL.md                          # Index / overview
  README.md                         # This file
  references/
    router-handoff.md               # Compact Router delegation rules
    slide-agent-guidance.md         # Full Slide Agent instructions
    font-policy.md                  # Font presets and rules
    artifact-response.md            # How to present results to user
    tool-contract.md                # Tool input/output schemas
    diagnostics-revision.md         # Quality check policy
  examples/
    manufacturing-line-q2-report.md # E2E example scenario
```

## Distinction from OpenAI slides skill vendor

```
OpenAI slides skill vendor (packages/presentation-author/vendor/):
  low-level PptxGenJS helper scripts used by presentation-author engine

Agentra presentation-author skill (skills/presentation-author/):
  operational instructions for Router and Slide Agent behavior
```

## Future

Agent Registry packaging can use this directory as the canonical skill
definition for presentation generation capabilities.
