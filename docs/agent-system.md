# Two-Agent Self-Improving Validation Loop

**Status:** 🅿️ parked concept — pick up **2026-06-24** (alongside Architecture Hub P2).
**Owner discussion:** 2026-06-23. **Canonical plan:** `docs/plan/BUILD-PLAN.md`.

## Goal

A self-improving loop of two cooperating Claude agents:

- **Testing / Validation Agent** — given a *high-level concept* (e.g. "Multi-AZ HA web app"),
  it exercises the implemented changes, checks AWS validity against **official AWS docs** +
  the app's own deterministic oracles, and reports what's wrong.
- **Developer Agent** — implements/fixes changes (the role currently played in these sessions).

The two iterate until findings converge to zero, and **each turn makes the system permanently
smarter**, not just one architecture.

## Core insight — ground the tester in oracles, not memory

An LLM that judges AWS validity from memory hallucinates. Give the validator **deterministic
oracles** and reserve the LLM for *triage + discovery*:

| Source of truth | Role |
|---|---|
| App `/validate` endpoint (our NET/SEC/ARC rules, path-finder, catalog lint) | Fast deterministic "is this valid?" |
| `terraform validate` (already in CI) | Proves the IaC is real |
| **AWS docs via WebFetch / WebSearch** | Authority for what the engine doesn't cover yet |
| The governance prompt (the AWS-validation rubric the user supplied 2026-06-23) | The validator's system prompt |

**The flywheel** = exactly the manual `test2 → NET-003/004/006` loop: validator finds a
violation the engine *missed* → cites the AWS doc → developer encodes it as a **new
deterministic rule + fixture** → the engine never misses it again. Each loop turn ends with a
fixed bug **or a new rule**. Test coverage compounds.

## Three implementation tiers (build in order)

1. **Two subagents in one session (start here).** `.claude/agents/aws-validator.md` +
   `.claude/agents/developer.md`, each with a scoped toolset:
   - *validator*: `Read, Grep, Glob, WebFetch, WebSearch, Bash` (curl `/validate`, Playwright) —
     **read-only on code**, writes only `findings.md`.
   - *developer*: `Edit, Write, Bash, Read` — drains `findings.md`, fixes, runs the test gate, commits.
   - Main session = orchestrator (spawn developer → spawn validator → repeat). Semi-automated.
2. **`/loop` self-pacing.** Wrap the orchestration in a slash command on a loop; converges when
   findings hit zero. Good for unattended bounded runs.
3. **Claude Agent SDK (true autonomy).** Two *independent* SDK sessions (separate processes)
   communicating via a shared medium (findings queue / GitHub issues / a git branch). Only this
   tier gives genuine peer agents that run unattended overnight.

> Caveat: in #1/#2 the agents are parent→child, not peers, and each subagent starts cold. Real
> long-lived peers require #3.

## Handoff protocol (decouple via an artifact, not chat)

`findings.md` — validator writes, developer reads:
```
## F-021  severity: high  status: open
Concept:  "Multi-AZ web app"
Observed: RDS in a public subnet
AWS rule: <link to AWS doc>
Repro:    POST model … → /validate returned no SEC finding   ← engine GAP
Ask:      add rule (preferred) or fix model
```
`status: open → fixing → verify → closed`. Developer flips to `verify`; validator confirms +
closes. Git history is the audit trail.

## Guardrails

- **Stop conditions:** max N iterations · "no new findings" convergence · **token/cost budget**.
- **Gate before commit:** developer change must pass `pnpm test` + lint + `/validate` (enforce via
  a `Stop` hook) or it's rejected — the loop can't degrade the codebase.
- **Separate write surfaces:** validator never edits `src/`; developer never edits the rubric.
  Use a **git worktree/branch** per developer run so a bad iteration is throwaway.
- **Prefer the deterministic oracle;** only escalate to LLM + WebFetch when the engine has no
  opinion — that "no opinion" *is* the signal of a missing rule (the valuable output).

## Recommended path

Start at tier #1, run 5–10 turns by hand, judge **finding quality** (real AWS violations with
doc citations, not noise). If good → graduate to `/loop`, then the SDK once trustworthy + cheap.
Don't build the SDK harness before the prompts produce good findings.

## Next actions (2026-06-24)

- [ ] Verify exact **subagent frontmatter** + **Agent SDK API** surface (ask the
      `claude-code-guide` agent) before scaffolding.
- [ ] Scaffold tier #1: `.claude/agents/aws-validator.md` (seed with the governance rubric +
      WebFetch + the `/validate` oracle) and `.claude/agents/developer.md` (wired to the test gate).
- [ ] Add the `findings.md` protocol file + a `/validation-loop` command.
- [ ] Run a few real turns on a seeded concept; review finding quality before automating further.
