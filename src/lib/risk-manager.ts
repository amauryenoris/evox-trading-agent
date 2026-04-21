import type { AlpacaAccount, AlpacaPosition, OpenPositionContext, AgentLogEntry } from './types'

// ============================================================
// SECTOR MAP — used to detect correlated positions
// ============================================================

const SECTOR_MAP: Record<string, string> = {
  AAPL: 'BIG_TECH',
  MSFT: 'BIG_TECH',
  NVDA: 'BIG_TECH',
  GOOGL: 'BIG_TECH',
  META: 'BIG_TECH',
  AMZN: 'BIG_TECH',
  TSLA: 'BIG_TECH',
  XOM: 'ENERGY',
  CVX: 'ENERGY',
  OXY: 'ENERGY',
  COP: 'ENERGY',
  MP: 'MINING',
  NEM: 'MINING',
  FCX: 'MINING',
  GOLD: 'MINING',
}

export function getPositionSector(symbol: string): string {
  return SECTOR_MAP[symbol] ?? 'OTHER'
}

// ============================================================
// TOTAL PORTFOLIO RISK
// sum(buyPrice * qty * stopLossPct) / equity
// ============================================================

export function calculateTotalPortfolioRisk(
  openContexts: OpenPositionContext[],
  equity: number
): number {
  if (equity === 0) return 0
  const stopLossPct = parseFloat(process.env.STOP_LOSS_PCT ?? '0.05')
  const totalRisk = openContexts.reduce((sum, ctx) => {
    return sum + ctx.buyPrice * ctx.quantity * stopLossPct
  }, 0)
  return totalRisk / equity
}

// ============================================================
// CORRELATED POSITIONS — count open positions in same sector
// (excluding the symbol itself)
// ============================================================

export function countCorrelatedPositions(
  symbol: string,
  openContexts: OpenPositionContext[]
): number {
  const targetSector = getPositionSector(symbol)
  return openContexts.filter(
    (ctx) => ctx.symbol !== symbol && getPositionSector(ctx.symbol) === targetSector
  ).length
}

// ============================================================
// CURRENT DRAWDOWN — vs peak equity in agent log
// ============================================================

export function calculateCurrentDrawdown(
  currentEquity: number,
  agentLog: AgentLogEntry[]
): number {
  if (agentLog.length === 0) return 0
  const peakEquity = agentLog.reduce((max, entry) => {
    const eq = parseFloat(entry.portfolioSnapshot.equity)
    return eq > max ? eq : max
  }, currentEquity)
  if (peakEquity === 0) return 0
  return (currentEquity - peakEquity) / peakEquity
}

// ============================================================
// GATE: is a new position allowed?
// Checks in order: drawdown ≤ -15%, total risk ≤ 10%, correlated < 3
// ============================================================

export async function isNewPositionAllowed(
  symbol: string,
  account: AlpacaAccount,
  positions: AlpacaPosition[],
  openContexts: OpenPositionContext[],
  agentLog: AgentLogEntry[]
): Promise<{ allowed: boolean; reason?: string }> {
  const equity = parseFloat(account.equity)

  // Gate 0: max positions check
  const maxPositions = parseInt(process.env.MAX_POSITIONS ?? '5', 10)
  if (positions.length >= maxPositions) {
    return {
      allowed: false,
      reason: `Max positions reached (${positions.length}/${maxPositions})`,
    }
  }

  // Gate 1: drawdown check
  const drawdown = calculateCurrentDrawdown(equity, agentLog)
  if (drawdown <= -0.15) {
    return {
      allowed: false,
      reason: `Drawdown gate: portfolio is down ${(drawdown * 100).toFixed(1)}% from peak (limit: -15%)`,
    }
  }

  // Gate 2: total portfolio risk check
  const totalRisk = calculateTotalPortfolioRisk(openContexts, equity)
  if (totalRisk >= 0.10) {
    return {
      allowed: false,
      reason: `Portfolio risk gate: total risk at ${(totalRisk * 100).toFixed(1)}% of equity (limit: 10%)`,
    }
  }

  // Gate 3: correlated positions check
  const correlatedCount = countCorrelatedPositions(symbol, openContexts)
  if (correlatedCount >= 3) {
    const sector = getPositionSector(symbol)
    return {
      allowed: false,
      reason: `Correlation gate: ${correlatedCount} positions already open in sector ${sector} (limit: 3)`,
    }
  }

  return { allowed: true }
}
