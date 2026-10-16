import { timingSafeEqual } from 'node:crypto'
import { getNextTradingDay } from '@/lib/alpaca'

export const dynamic = 'force-dynamic'
export const maxDuration = 15

const WORKFLOW_BY_TARGET: Readonly<Record<string, string>> = {
  cycle: 'agent-cron.yml',
  exits: 'agent-exits.yml',
  health: 'position-health.yml',
  bars: 'daily-bars-sync.yml',
  weekly: 'weekly-report.yml',
}

const DISPATCH_REF = 'main'
const DEFAULT_GITHUB_OWNER = 'amauryenoris'
const DEFAULT_GITHUB_REPO = 'evox-trading-agent'
const GITHUB_API_VERSION = '2022-11-28'
const GITHUB_TIMEOUT_MS = 10_000
const CALENDAR_TIMEOUT_MS = 3_000
const MARKET_TIME_ZONE = 'America/New_York'
const MS_PER_DAY = 24 * 60 * 60 * 1000
const NOON_UTC_SUFFIX = 'T12:00:00Z'

type Outcome = 'dispatched' | 'skipped' | 'failed'

interface GithubSettings {
  token: string
  owner: string
  repo: string
}

function failure(status: number, error: string): Response {
  return Response.json({ success: false, error }, { status })
}

function logOutcome(target: string, outcome: Outcome, detail = ''): void {
  console.log(`[cron/run] target=${target} outcome=${outcome}${detail}`)
}

function isAuthorized(req: Request, secret: string): boolean {
  const presented = req.headers.get('authorization')
  if (!presented) return false
  const presentedBytes = Buffer.from(presented)
  const expectedBytes = Buffer.from(`Bearer ${secret}`)
  if (presentedBytes.length !== expectedBytes.length) return false
  return timingSafeEqual(presentedBytes, expectedBytes)
}

function resolveWorkflow(target: string | null): string | null {
  if (target === null || !Object.prototype.hasOwnProperty.call(WORKFLOW_BY_TARGET, target)) return null
  return WORKFLOW_BY_TARGET[target]
}

const REDACTED = '[redacted]'

function redactSecrets(text: string): string {
  return [process.env.CRON_SECRET, process.env.GITHUB_TOKEN]
    .filter((value): value is string => Boolean(value))
    .reduce((out, value) => out.split(value).join(REDACTED), text)
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.stack ?? `${err.name}: ${err.message}`
  return String(err)
}

function readGithubSettings(): GithubSettings | null {
  const token = process.env.GITHUB_TOKEN
  if (!token) return null
  return {
    token,
    owner: process.env.GITHUB_OWNER || DEFAULT_GITHUB_OWNER,
    repo: process.env.GITHUB_REPO || DEFAULT_GITHUB_REPO,
  }
}

function marketDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MARKET_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function isoDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

async function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs)
  })
  try {
    return await Promise.race([work, timeout])
  } finally {
    clearTimeout(timer)
  }
}

// Fails open: any calendar problem means "dispatch", the workflows run their own market checks.
async function isTradingDay(now: Date): Promise<boolean> {
  const today = marketDate(now)
  const previousDay = isoDate(new Date(new Date(`${today}${NOON_UTC_SUFFIX}`).getTime() - MS_PER_DAY))
  try {
    const next = await withTimeout(getNextTradingDay(new Date(`${previousDay}${NOON_UTC_SUFFIX}`), 1), CALENDAR_TIMEOUT_MS)
    return next === null || isoDate(next) === today
  } catch {
    return true
  }
}

async function dispatchWorkflow(settings: GithubSettings, workflowFile: string): Promise<boolean> {
  const url =
    `https://api.github.com/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}` +
    `/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: DISPATCH_REF }),
      signal: controller.signal,
    })
    if (res.status === 204) return true
    console.error(`[cron/run] GitHub dispatch failed with status ${res.status}`)
    return false
  } catch (err) {
    console.error(`[cron/run] GitHub dispatch failed with ${err instanceof Error ? err.name : 'UnknownError'}`)
    return false
  } finally {
    clearTimeout(timer)
  }
}

export async function GET(): Promise<Response> {
  return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } })
}

export async function POST(req: Request): Promise<Response> {
  try {
    return await handlePost(req)
  } catch (err) {
    console.error(`[cron/run] unhandled error: ${redactSecrets(describeError(err))}`)
    return failure(500, 'Internal server error')
  }
}

async function handlePost(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret) return failure(503, 'Service unavailable')
  if (!isAuthorized(req, secret)) return failure(401, 'Unauthorized')

  const target = new URL(req.url).searchParams.get('target')
  const workflowFile = resolveWorkflow(target)
  if (target === null || workflowFile === null) return failure(400, 'Invalid target')

  const settings = readGithubSettings()
  if (!settings) {
    console.error(`[cron/run] target=${target} outcome=failed reason=missing_github_token missing=GITHUB_TOKEN`)
    return failure(500, 'Internal server error')
  }

  if (!(await isTradingDay(new Date()))) {
    logOutcome(target, 'skipped', ' reason=non_trading_day')
    return Response.json({ success: true, skipped: 'non_trading_day' })
  }

  if (!(await dispatchWorkflow(settings, workflowFile))) {
    logOutcome(target, 'failed')
    return failure(502, 'Bad gateway')
  }

  logOutcome(target, 'dispatched')
  return Response.json({ success: true, target, dispatched: true })
}
