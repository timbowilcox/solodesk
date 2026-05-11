# Handoff: date-strip pass — planning docs

**Repo:** solodesk
**Branch:** `claude/affectionate-morse-ae1ddc`
**Session type:** Maintenance (project-timeline date removal)
**Author:** Claude (Sonnet 4.6) under Tim's harness

Task: strip all project-timeline dates and timeframe commitments from root planning markdown files so the repo can be shared or reviewed without embedding hard commitments.

---

## Files touched

| File | Changes | Commit |
|---|---|---|
| `SPRINT.md` | Removed `**Date:** 2026-05-07` header line | `ccfe689` |
| `HANDOFF.md` | Removed `**Date:** 2026-05-07` header line | `72425c2` |
| `README.md` | Removed `(Apr-Oct 2026)` + `1 November 2026` from intent sentence; stripped date from `## Decision:` header; removed `Don't drift past this date.` | `4e267c7` |
| `ROADMAP.md` | Replaced 5× `Nov 1` / `1 November 2026` references: productise-call section, Loop 11 + team-inbound bullets, hard-gate line, experience-layer prerequisite line | `7a42b13` |

**Total references removed: 10**

`COMPANY.template.md` — no edits made (see flagged items below).

---

## Items not auto-removed — flagged for your review

### 1. Business-rule dates (content, not project timeline)

Two places encode "Realtelligence must not mention RealStyler before November 2026" as a venture anti-pattern. Removing the date changes the rule from a time-bounded constraint to a permanent ban. Needs your call.

| File | Line | Content |
|---|---|---|
| `ROADMAP.md` | 173 | `- Realtelligence anti-pattern enforced: critic auto-rejects any draft that mentions RealStyler before Nov 2026.` |
| `COMPANY.template.md` | 44 | `- Realtelligence: must not mention RealStyler before November 2026` |

**Options:** (a) remove the date entirely — rule becomes permanent; (b) replace with a relative anchor like "before RealStyler public launch"; (c) leave as-is if this constraint has already expired.

---

### 2. Evaluation-criterion durations (README.md)

These are in the productise/don't criteria section. They reference duration as a quality bar, not a project deadline, but they contain month counts.

| Line | Content |
|---|---|
| 128 | `- Has it survived 6 months without major rebuild?` |
| 129 | `- Has the rubric library actually compounded (measurable: rejection rate of agent outputs at 4-6 weeks vs at month 5)?` |

**Recommendation:** leave these — they describe what you're measuring, not when the project ends. But if you want them gone, replace "6 months" with "the full run" and "4-6 weeks vs at month 5" with "early run vs late run".

---

## Items confirmed as runtime config — kept intentionally

| File | Content | Reason |
|---|---|---|
| `HANDOFF.md` | `last 7 days` | Metric window in cron description |
| `ROADMAP.md` | `created_at < now() - 30 days` | SQL query parameter |
| `README.md` | `claude-haiku-4-5-20251001` | Model identifier |
| `CLAUDE.md` | `claude-haiku-4-5-20251001` | Model identifier |

---

## Grep verification

After edits, `grep -rEi "(20[0-9]{2}|january|...|november|...) SPRINT.md HANDOFF.md README.md ROADMAP.md COMPANY.template.md` returns only:

- `SPRINT.md:103` — false positive (ripgrep boundary match on "processes"; no date in content)
- `README.md:62` — model identifier `claude-haiku-4-5-20251001`
- `ROADMAP.md:173` — flagged item #1 above
- `COMPANY.template.md:44` — flagged item #1 above

Duration grep returns only runtime config values plus the two flagged evaluation-criterion lines in README.md.
