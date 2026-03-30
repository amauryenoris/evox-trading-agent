import PDFDocument from 'pdfkit'
import {
  getAgentLog,
  getTradeEvaluations,
  getPatternLibrary,
  insertWeeklyReport,
  type WeeklyReportRecord,
  type WeeklyReportSummary,
} from './db'
import { createClient } from '@supabase/supabase-js'
import type { AgentLogEntry, TradeEvaluation, TradingPattern } from './types'

// ============================================================
// WEEK RANGE HELPERS
// ============================================================

function getWeekRange(): { weekStart: Date; weekEnd: Date } {
  const now = new Date()
  const dayOfWeek = now.getDay() // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const monday = new Date(now)
  monday.setDate(now.getDate() - daysToMonday)
  monday.setHours(0, 0, 0, 0)

  const friday = new Date(monday)
  friday.setDate(monday.getDate() + 4)
  friday.setHours(23, 59, 59, 999)

  return { weekStart: monday, weekEnd: friday }
}

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0]
}

// ============================================================
// SUMMARY CALCULATION
// ============================================================

function calculateSummary(
  agentLog: AgentLogEntry[],
  evaluations: TradeEvaluation[],
  weekStart: Date,
  weekEnd: Date
): WeeklyReportSummary {
  const weekEntries = agentLog.filter((e) => {
    const t = new Date(e.timestamp)
    return t >= weekStart && t <= weekEnd
  })
  const weekEvals = evaluations.filter((e) => {
    const t = new Date(e.sellTimestamp)
    return t >= weekStart && t <= weekEnd
  })

  const buyDecisions = weekEntries.filter((e) => e.decision.action === 'BUY').length
  const sellDecisions = weekEntries.filter((e) => e.decision.action === 'SELL').length
  const holdDecisions = weekEntries.filter((e) => e.decision.action === 'HOLD').length
  const tradesExecuted = weekEntries.filter((e) => e.orderExecuted).length

  const wins = weekEvals.filter((e) => e.outcome === 'profit')
  const losses = weekEvals.filter((e) => e.outcome === 'loss')
  const winRate = weekEvals.length > 0 ? wins.length / weekEvals.length : 0
  const avgWinPct = wins.length > 0 ? wins.reduce((s, e) => s + e.pnlPct, 0) / wins.length : 0
  const avgLossPct = losses.length > 0 ? losses.reduce((s, e) => s + e.pnlPct, 0) / losses.length : 0

  const grossProfit = wins.reduce((s, e) => s + e.pnlUSD, 0)
  const grossLoss = Math.abs(losses.reduce((s, e) => s + e.pnlUSD, 0))
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0

  // Equity start/end from portfolio snapshots
  const sorted = [...weekEntries].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  const equityStart = sorted.length > 0 ? parseFloat(sorted[0].portfolioSnapshot.equity) : 0
  const equityEnd = sorted.length > 0 ? parseFloat(sorted[sorted.length - 1].portfolioSnapshot.equity) : 0
  const pnlUSD = equityEnd - equityStart
  const pnlPct = equityStart > 0 ? pnlUSD / equityStart : 0

  return {
    equityStart,
    equityEnd,
    pnlUSD,
    pnlPct,
    totalCycles: weekEntries.length,
    buyDecisions,
    sellDecisions,
    holdDecisions,
    tradesExecuted,
    winRate,
    avgWinPct,
    avgLossPct,
    profitFactor: isFinite(profitFactor) ? profitFactor : 0,
  }
}

// ============================================================
// PDF GENERATION
// ============================================================

function generatePDF(
  summary: WeeklyReportSummary,
  evaluations: TradeEvaluation[],
  patterns: TradingPattern[],
  weekStart: Date,
  weekEnd: Date
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const green = '#1daa6c'
    const gray = '#555555'
    const black = '#000000'

    // ---- Header ----
    doc.fontSize(20).fillColor(black).text('Weekly Trading Report', { align: 'center' })
    doc.fontSize(11).fillColor(gray).text(
      `${toDateString(weekStart)} — ${toDateString(weekEnd)}`,
      { align: 'center' }
    )
    doc.moveDown(1.5)

    // ---- Portfolio Performance ----
    doc.fontSize(14).fillColor(green).text('Portfolio Performance')
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(green).lineWidth(0.5).stroke()
    doc.moveDown(0.5)

    const pnlSign = summary.pnlUSD >= 0 ? '+' : ''
    doc.fontSize(11).fillColor(black)
    doc.text(`Equity (start of week): $${summary.equityStart.toFixed(2)}`)
    doc.text(`Equity (end of week):   $${summary.equityEnd.toFixed(2)}`)
    doc.text(`Weekly P&L: ${pnlSign}$${summary.pnlUSD.toFixed(2)} (${pnlSign}${(summary.pnlPct * 100).toFixed(2)}%)`)
    doc.moveDown(1)

    // ---- Trade Statistics ----
    doc.fontSize(14).fillColor(green).text('Trade Statistics')
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(green).lineWidth(0.5).stroke()
    doc.moveDown(0.5)

    doc.fontSize(11).fillColor(black)
    doc.text(`Total cycles analyzed:  ${summary.totalCycles}`)
    doc.text(`BUY decisions:          ${summary.buyDecisions}`)
    doc.text(`SELL decisions:         ${summary.sellDecisions}`)
    doc.text(`HOLD decisions:         ${summary.holdDecisions}`)
    doc.text(`Trades executed:        ${summary.tradesExecuted}`)
    doc.text(`Win rate:               ${(summary.winRate * 100).toFixed(1)}%`)
    doc.text(`Avg win:                +${(summary.avgWinPct * 100).toFixed(2)}%`)
    doc.text(`Avg loss:               ${(summary.avgLossPct * 100).toFixed(2)}%`)
    doc.text(`Profit factor:          ${summary.profitFactor.toFixed(2)}`)
    doc.moveDown(1)

    // ---- Trade Log ----
    const weekEvals = evaluations.filter((e) => {
      const t = new Date(e.sellTimestamp)
      return t >= weekStart && t <= weekEnd
    })

    if (weekEvals.length > 0) {
      doc.fontSize(14).fillColor(green).text('Trade Log')
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(green).lineWidth(0.5).stroke()
      doc.moveDown(0.5)

      // Column headers
      doc.fontSize(9).fillColor(gray)
      doc.text('Symbol', 50, doc.y, { width: 60, continued: false })
      const headerY = doc.y - doc.currentLineHeight()
      doc.text('Buy $', 120, headerY, { width: 65, continued: false })
      doc.text('Sell $', 190, headerY, { width: 65, continued: false })
      doc.text('Qty', 260, headerY, { width: 40, continued: false })
      doc.text('P&L USD', 305, headerY, { width: 80, continued: false })
      doc.text('P&L %', 390, headerY, { width: 60, continued: false })
      doc.text('Outcome', 455, headerY, { width: 90, continued: false })
      doc.moveDown(0.3)

      doc.fontSize(9).fillColor(black)
      for (const ev of weekEvals) {
        const rowY = doc.y
        const pnlColor = ev.pnlUSD >= 0 ? green : '#cc3333'
        doc.text(ev.symbol, 50, rowY, { width: 60, continued: false })
        doc.text(`$${ev.buyPrice.toFixed(2)}`, 120, rowY, { width: 65, continued: false })
        doc.text(`$${ev.sellPrice.toFixed(2)}`, 190, rowY, { width: 65, continued: false })
        doc.text(String(ev.quantity), 260, rowY, { width: 40, continued: false })
        doc.fillColor(pnlColor).text(`${ev.pnlUSD >= 0 ? '+' : ''}$${ev.pnlUSD.toFixed(2)}`, 305, rowY, { width: 80, continued: false })
        doc.text(`${ev.pnlPct >= 0 ? '+' : ''}${(ev.pnlPct * 100).toFixed(1)}%`, 390, rowY, { width: 60, continued: false })
        doc.fillColor(black).text(ev.outcome, 455, rowY, { width: 90, continued: false })
        doc.moveDown(0.3)
      }
      doc.moveDown(0.7)
    }

    // ---- Top 5 Patterns ----
    const topPatterns = patterns
      .filter((p) => p.sampleCount >= 2)
      .sort((a, b) => b.winRate - a.winRate)
      .slice(0, 5)

    if (topPatterns.length > 0) {
      doc.fontSize(14).fillColor(green).text('Top Patterns (by win rate)')
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(green).lineWidth(0.5).stroke()
      doc.moveDown(0.5)

      doc.fontSize(10).fillColor(black)
      for (const p of topPatterns) {
        doc.text(`• ${p.description}`, { indent: 10 })
        doc.fontSize(9).fillColor(gray)
        doc.text(
          `  Win rate: ${(p.winRate * 100).toFixed(0)}%  |  Avg P&L: ${p.avgPnLPct >= 0 ? '+' : ''}${p.avgPnLPct.toFixed(1)}%  |  Samples: ${p.sampleCount}  |  Action: ${p.action}`,
          { indent: 10 }
        )
        doc.fontSize(10).fillColor(black)
        doc.moveDown(0.3)
      }
      doc.moveDown(0.5)
    }

    // ---- Lessons Learned ----
    const allLessons = weekEvals.flatMap((e) => e.lessonsLearned)
    const uniqueLessons = [...new Set(allLessons)].slice(0, 5)

    if (uniqueLessons.length > 0) {
      doc.fontSize(14).fillColor(green).text('Lessons Learned')
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(green).lineWidth(0.5).stroke()
      doc.moveDown(0.5)

      doc.fontSize(10).fillColor(black)
      for (const lesson of uniqueLessons) {
        doc.text(`• ${lesson}`, { indent: 10 })
        doc.moveDown(0.2)
      }
    }

    // ---- Footer ----
    doc.fontSize(8).fillColor(gray).text(
      `Generated by EVOX Trading Agent on ${new Date().toISOString()}`,
      50,
      doc.page.height - 40,
      { align: 'center', width: 495 }
    )

    doc.end()
  })
}

// ============================================================
// MAIN: generate, upload, and save report record
// ============================================================

export async function generateAndSaveReport(): Promise<WeeklyReportRecord> {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  }

  const { weekStart, weekEnd } = getWeekRange()

  // Fetch data
  const [agentLog, evaluations, patterns] = await Promise.all([
    getAgentLog(2000),
    getTradeEvaluations(500),
    getPatternLibrary(),
  ])

  const summary = calculateSummary(agentLog, evaluations, weekStart, weekEnd)
  const pdfBuffer = await generatePDF(summary, evaluations, patterns, weekStart, weekEnd)

  // Upload to Supabase Storage
  const filename = `report-${toDateString(weekStart)}_${toDateString(weekEnd)}.pdf`
  const db = createClient(supabaseUrl, serviceKey)
  const { error: uploadError } = await db.storage
    .from('weekly-reports')
    .upload(filename, pdfBuffer, { contentType: 'application/pdf', upsert: true })

  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`)

  // Save record in database
  const record = await insertWeeklyReport({
    weekStart: toDateString(weekStart),
    weekEnd: toDateString(weekEnd),
    storagePath: filename,
    summary,
  })

  return record
}
