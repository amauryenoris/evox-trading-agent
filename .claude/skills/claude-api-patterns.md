# Claude API Patterns — Paquito

## Model and client setup

```typescript
import Anthropic from '@anthropic-ai/sdk'
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
```

Model in use: `claude-sonnet-4-6`. Do not change without confirming with Amaury.
Max tokens per call: `1024` (analysis responses are short JSON).

## Claude's role in this system

Claude is a **pure analyst**. It never decides whether to trade.
The system detects setups and executes orders. Claude provides context for logging and learning only.

Claude must NOT say BUY/SELL/HOLD, reference confidence thresholds, reject or approve trades,
or use language like "prohibits" or "blocks entry".

## System prompt (static — defined in src/lib/claude-agent.ts)

Do not modify the system prompt without confirming with Amaury. It carefully constrains Claude's role.
The prompt enforces strict JSON output — no markdown, no text outside JSON.

## Expected response schema

```typescript
interface AgentDecision {
  reasoning: string           // 2-4 sentences: what indicators show
  confidence: number          // 0.0 – 1.0
  learning_note: string       // what this case teaches
  near_miss_score: number     // 1-10 setup quality
  what_would_trigger: string  // what condition would strengthen the signal
  self_flagged_disqualifying_risk?: boolean  // optional, observability-only — see claude-agent.ts SYSTEM_PROMPT
  action?: string             // overridden to 'HOLD' by system after parsing
  quantity?: number
  symbol?: string
}
```

## Calling the API — always use the retry wrapper

The project has a retry helper in `claude-agent.ts` for 429/529 errors. Use it, don't call `client.messages.create` directly in new code:

```typescript
const response = await callClaudeWithRetry(client, {
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  system: SYSTEM_PROMPT,
  messages: [{ role: 'user', content: userPrompt }],
})
```

Retry strategy: exponential backoff, up to 4 retries, max delay 30s, with ±500ms jitter.
Only retries on status 429 (rate limit) and 529 (overloaded). All other errors throw immediately.

## Rate limits and cost

- Each cycle analyzes ~10-15 symbols. One Claude call per symbol.
- Max tokens per call: 1024 output. Input varies (~2-4k tokens per prompt).
- At current usage: ~$0.01–0.05 per full cycle.
- If you see 429s in prod, the retry wrapper handles them. Do not add sleeps manually.

## Parsing the response

Claude is instructed to return strict JSON but may occasionally wrap it in markdown fences.
Always strip fences before parsing:

```typescript
const jsonText = content.text.replace(/```json\n?|\n?```/g, '').trim()
try {
  decision = JSON.parse(jsonText) as AgentDecision
} catch {
  console.error(`[CLAUDE] JSON parse failed for ${symbol}:`, jsonText.slice(0, 200))
  decision = { action: 'HOLD', symbol, quantity: 0, reasoning: 'Parse error', confidence: 0 }
}
// Always override action — Claude does not decide
decision.action = 'HOLD'
decision.symbol = symbol
```

## Building prompts

The enriched prompt is built by `buildEnrichedPrompt()` in `claude-agent.ts`.
It includes: macro news, symbol news, all indicator values with labels, portfolio state,
learning history, watchlist context, active setup type.

Do not build ad-hoc prompts for trading analysis outside of this function.
If you need to add context, extend `buildEnrichedPrompt()`.
