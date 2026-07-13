# Requirements — Self-Flagged Disqualifying Risk Observability Field

## Functional Requirements

FR-01: The system shall accept an optional `self_flagged_disqualifying_risk` boolean field on Claude's parsed response.
FR-02: The system shall instruct Claude, via the system prompt's response schema, to include `self_flagged_disqualifying_risk` in every JSON response.
FR-03: The system shall instruct Claude to set `self_flagged_disqualifying_risk` to `true` only when its reasoning explicitly names a specific prior loss (symbol + percentage) or an aggregate negative historical outcome statistic for the same setup shape.
FR-04: The system shall instruct Claude not to infer `self_flagged_disqualifying_risk: true` from general caution, elevated-risk indicators, or market uncertainty language alone, absent a named historical loss or negative statistic.
FR-05: The system shall instruct Claude not to set `self_flagged_disqualifying_risk: true` solely because historical evidence was cited, when that evidence is positive precedent or mixed (positive precedent alongside an unrelated negative analogy).
FR-06: Where the parsed response's `self_flagged_disqualifying_risk` is a boolean (`true` or `false`), the system shall persist that exact value into `agent_log.indicators`.
FR-07: Where the parsed response's `self_flagged_disqualifying_risk` is absent, the system shall not add the key to `agent_log.indicators`.
FR-08: Where the parsed response's `self_flagged_disqualifying_risk` is present but not a boolean, the system shall treat it as absent and not persist it.
FR-09: The system shall leave `decision.action` forced to `'HOLD'` regardless of `self_flagged_disqualifying_risk`'s value.
FR-10: The system shall not read `self_flagged_disqualifying_risk` in any gate, sizing, or order-execution code path in this change.

## Non-Functional Requirements

NFR-01: The new field's validation shall use an explicit `typeof` runtime check, consistent with the pipeline's existing lack of schema-validation library (no Zod), rather than trusting the `as AgentDecision` cast.
NFR-02: The change shall not alter the validation behavior of the 3 existing optional fields (`learning_note`, `near_miss_score`, `what_would_trigger`) — they remain unvalidated, matching current behavior.
NFR-03: The change shall not introduce a new database column or table — persistence follows the existing `indicators` jsonb conditional-spread pattern.

## Constraints

C-01: This feature touches `src/lib/claude-agent.ts` (Protected Zone) — requires the standard explicit pre-implementation confirmation via `tasks.md`, per `specs/README.md`, notwithstanding the request's own "authorized by Amaury" framing.
C-02: This feature must not modify `decision.action = 'HOLD'` override logic, or any gate/setup-detection/exit-rule logic.
C-03: This feature must not modify `decision.confidence`'s existing sizing logic.
C-04: This feature must not modify `db.ts`, `insertAgentLogEntry`, or add any new dedicated column.
C-05: This feature must not add any code path that reads `self_flagged_disqualifying_risk` to influence `orderExecuted`, sizing, or any decision.
C-06: This feature must not touch any Protected Zone file other than `src/lib/claude-agent.ts`, plus `src/lib/types.ts` (not Protected-Zone-listed, but the shared type definition file).

## Out of Scope

- Any future gate, alert, or dashboard surface built on top of `self_flagged_disqualifying_risk` — this spec is data-collection only.
- Backfilling historical `agent_log` rows with a retroactively-computed value for past trades (including the 7 documented cases) — those remain identified only via manual transcript review.
- Deciding the eventual n>=20-30 threshold policy or what action (if any) the system should take once reached — explicitly deferred per the learning objective.
- Adding the field to `trade_evaluations` or any other table.
