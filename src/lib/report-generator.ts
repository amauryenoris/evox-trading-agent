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
// DESIGN TOKENS
// ============================================================

const PAGE_WIDTH  = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN      = 50
const CONTENT_W   = PAGE_WIDTH - MARGIN * 2  // 495.28

const C_BLACK      = '#000000'
const C_GREEN      = '#1daa6c'
const C_GREEN_DARK = '#147a4e'
const C_WHITE      = '#ffffff'
const C_GRAY_LIGHT = '#f5f5f5'
const C_GRAY_MID   = '#888888'
const C_RED        = '#cc3333'

// ============================================================
// TABLE TYPES
// ============================================================

interface TableColumn {
  label: string
  width: number
  align?: 'left' | 'right' | 'center'
}

interface TableRow {
  cells: string[]
  colors?: (string | null)[]
}

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
// PDF DRAW HELPERS
// ============================================================

function drawLogo(doc: PDFKit.PDFDocument, x: number, y: number): void {
  doc.font('Helvetica-Bold').fontSize(24).fillColor(C_WHITE).text('EVOX', x, y, { lineBreak: false })
  const waveX = x + doc.widthOfString('EVOX') + 8

  // Onda superior — curva Bezier que forma una S-wave
  doc.save()
  doc
    .moveTo(waveX, y + 8)
    .bezierCurveTo(waveX + 5, y + 2, waveX + 11, y + 14, waveX + 22, y + 8)
    .strokeColor(C_GREEN)
    .lineWidth(2.5)
    .stroke()

  // Onda inferior — paralela, desplazada 7pt hacia abajo
  doc
    .moveTo(waveX, y + 15)
    .bezierCurveTo(waveX + 5, y + 9, waveX + 11, y + 21, waveX + 22, y + 15)
    .strokeColor(C_GREEN)
    .lineWidth(2.5)
    .stroke()
  doc.restore()
}

function drawHeader(doc: PDFKit.PDFDocument, weekStart: Date, weekEnd: Date): void {
  // Banda negra full-bleed
  doc.rect(0, 0, PAGE_WIDTH, 90).fill(C_BLACK)

  drawLogo(doc, MARGIN, 28)

  // Subtítulo izquierda
  doc
    .font('Helvetica')
    .fontSize(11)
    .fillColor('#cccccc')
    .text('Weekly Trading Report', MARGIN, 60, { lineBreak: false })

  // Rango de fechas alineado a la derecha
  doc
    .fontSize(10)
    .fillColor('#999999')
    .text(
      `${toDateString(weekStart)}  —  ${toDateString(weekEnd)}`,
      MARGIN,
      61,
      { width: CONTENT_W, align: 'right' }
    )

  // Mover cursor debajo del header
  doc.y = 110
}

function drawKPIBoxes(doc: PDFKit.PDFDocument, summary: WeeklyReportSummary): void {
  const BOX_W  = 117
  const BOX_H  = 58
  const GAP    = 8
  const startY = doc.y

  const kpis = [
    {
      label: 'Equity (end)',
      value: `$${summary.equityEnd.toFixed(2)}`,
      color: C_BLACK,
    },
    {
      label: 'Weekly P&L',
      value: `${summary.pnlUSD >= 0 ? '+' : ''}$${summary.pnlUSD.toFixed(2)}`,
      color: summary.pnlUSD >= 0 ? C_GREEN : C_RED,
    },
    {
      label: 'Win Rate',
      value: `${(summary.winRate * 100).toFixed(1)}%`,
      color: summary.winRate >= 0.5 ? C_GREEN : C_RED,
    },
    {
      label: 'Profit Factor',
      value: summary.profitFactor.toFixed(2),
      color: summary.profitFactor >= 1 ? C_GREEN : C_RED,
    },
  ]

  for (let i = 0; i < kpis.length; i++) {
    const x = MARGIN + i * (BOX_W + GAP)
    const kpi = kpis[i]

    // Fondo blanco con borde verde
    doc
      .roundedRect(x, startY, BOX_W, BOX_H, 4)
      .fillColor(C_WHITE)
      .strokeColor(C_GREEN)
      .lineWidth(1)
      .fillAndStroke()

    // Valor grande
    doc
      .font('Helvetica-Bold')
      .fontSize(15)
      .fillColor(kpi.color)
      .text(kpi.value, x + 6, startY + 10, { width: BOX_W - 12, align: 'center' })

    // Etiqueta pequeña
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(C_GRAY_MID)
      .text(kpi.label, x + 6, startY + 38, { width: BOX_W - 12, align: 'center' })
  }

  doc.y = startY + BOX_H + 18
}

function drawSectionTitle(doc: PDFKit.PDFDocument, title: string): void {
  doc.moveDown(0.8)
  doc.font('Helvetica-Bold').fontSize(13).fillColor(C_GREEN).text(title)
  const lineY = doc.y + 2
  doc
    .moveTo(MARGIN, lineY)
    .lineTo(MARGIN + CONTENT_W, lineY)
    .strokeColor(C_GREEN)
    .lineWidth(0.5)
    .stroke()
  doc.moveDown(0.6)
  doc.font('Helvetica').fontSize(10).fillColor(C_BLACK)
}

function drawStyledTable(
  doc: PDFKit.PDFDocument,
  columns: TableColumn[],
  rows: TableRow[]
): void {
  const ROW_H    = 20
  const HEADER_H = 22
  const PADDING  = 6

  const renderHeader = (y: number) => {
    doc.rect(MARGIN, y, CONTENT_W, HEADER_H).fillColor(C_GREEN_DARK).fill()
    let cx = MARGIN + PADDING
    for (const col of columns) {
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor(C_WHITE)
        .text(col.label, cx, y + 6, {
          width: col.width - PADDING,
          align: col.align ?? 'left',
          lineBreak: false,
        })
      cx += col.width
    }
  }

  // Dibujar header inicial
  renderHeader(doc.y)
  doc.y = doc.y + HEADER_H

  for (let i = 0; i < rows.length; i++) {
    // Overflow de página
    if (doc.y + ROW_H > PAGE_HEIGHT - 80) {
      doc.addPage()
      doc.y = MARGIN
      renderHeader(doc.y)
      doc.y = doc.y + HEADER_H
    }

    const rowY    = doc.y
    const rowFill = i % 2 === 0 ? C_WHITE : C_GRAY_LIGHT

    doc.rect(MARGIN, rowY, CONTENT_W, ROW_H).fillColor(rowFill).fill()

    let dx = MARGIN + PADDING
    const row = rows[i]

    for (let j = 0; j < columns.length; j++) {
      const cellColor = row.colors?.[j] ?? C_BLACK
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(cellColor)
        .text(row.cells[j] ?? '', dx, rowY + 5, {
          width: columns[j].width - PADDING,
          align: columns[j].align ?? 'left',
          lineBreak: false,
        })
      dx += columns[j].width
    }

    doc.y = rowY + ROW_H
  }

  doc.moveDown(1)
}

function drawFooter(doc: PDFKit.PDFDocument, pageNum: number, totalPages: number): void {
  const footerY = PAGE_HEIGHT - 35

  doc
    .moveTo(MARGIN, footerY)
    .lineTo(MARGIN + CONTENT_W, footerY)
    .strokeColor(C_GREEN)
    .lineWidth(0.5)
    .stroke()

  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(C_GRAY_MID)
    .text('EVOX Trading Agent', MARGIN, footerY + 6, { lineBreak: false })

  doc
    .text(`Page ${pageNum} of ${totalPages}`, MARGIN, footerY + 6, {
      width: CONTENT_W,
      align: 'right',
    })
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
    const doc = new PDFDocument({ margin: MARGIN, size: 'A4', bufferPages: true })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    // ---- Header con logo EVOX ----
    drawHeader(doc, weekStart, weekEnd)

    // ---- KPI Boxes ----
    drawKPIBoxes(doc, summary)

    // ---- Portfolio Performance ----
    drawSectionTitle(doc, 'Portfolio Performance')

    const pnlSign = summary.pnlUSD >= 0 ? '+' : ''
    doc.fontSize(10).fillColor(C_BLACK)
    doc.text(`Equity (start of week):   $${summary.equityStart.toFixed(2)}`)
    doc.text(`Equity (end of week):     $${summary.equityEnd.toFixed(2)}`)
    doc
      .fillColor(summary.pnlUSD >= 0 ? C_GREEN : C_RED)
      .text(`Weekly P&L:               ${pnlSign}$${summary.pnlUSD.toFixed(2)} (${pnlSign}${(summary.pnlPct * 100).toFixed(2)}%)`)
    doc.fillColor(C_BLACK)

    // ---- Trade Statistics ----
    drawSectionTitle(doc, 'Trade Statistics')

    doc.fontSize(10).fillColor(C_BLACK)
    doc.text(`Total cycles analyzed:    ${summary.totalCycles}`)
    doc.text(`BUY / SELL / HOLD:        ${summary.buyDecisions} / ${summary.sellDecisions} / ${summary.holdDecisions}`)
    doc.text(`Trades executed:          ${summary.tradesExecuted}`)
    doc.text(`Win rate:                 ${(summary.winRate * 100).toFixed(1)}%`)
    doc.text(`Avg win:                  +${(summary.avgWinPct * 100).toFixed(2)}%`)
    doc.text(`Avg loss:                 ${(summary.avgLossPct * 100).toFixed(2)}%`)
    doc.text(`Profit factor:            ${summary.profitFactor.toFixed(2)}`)

    // ---- Trade Log ----
    const weekEvals = evaluations.filter((e) => {
      const t = new Date(e.sellTimestamp)
      return t >= weekStart && t <= weekEnd
    })

    if (weekEvals.length > 0) {
      drawSectionTitle(doc, 'Trade Log')

      // Columnas: suma de widths = 495pt exactos
      const tradeColumns: TableColumn[] = [
        { label: 'Symbol',  width: 60               },
        { label: 'Buy $',   width: 65, align: 'right' },
        { label: 'Sell $',  width: 65, align: 'right' },
        { label: 'Qty',     width: 40, align: 'right' },
        { label: 'P&L USD', width: 85, align: 'right' },
        { label: 'P&L %',   width: 60, align: 'right' },
        { label: 'Outcome', width: 120               },
      ]

      const tradeRows: TableRow[] = weekEvals.map((ev) => ({
        cells: [
          ev.symbol,
          `$${ev.buyPrice.toFixed(2)}`,
          `$${ev.sellPrice.toFixed(2)}`,
          String(ev.quantity),
          `${ev.pnlUSD >= 0 ? '+' : ''}$${ev.pnlUSD.toFixed(2)}`,
          `${ev.pnlPct >= 0 ? '+' : ''}${(ev.pnlPct * 100).toFixed(1)}%`,
          ev.outcome,
        ],
        colors: [null, null, null, null, ev.pnlUSD >= 0 ? C_GREEN : C_RED, null, null],
      }))

      drawStyledTable(doc, tradeColumns, tradeRows)
    }

    // ---- Top 5 Patterns ----
    const topPatterns = patterns
      .filter((p) => p.sampleCount >= 2)
      .sort((a, b) => b.winRate - a.winRate)
      .slice(0, 5)

    if (topPatterns.length > 0) {
      drawSectionTitle(doc, 'Top Patterns (by win rate)')

      for (const p of topPatterns) {
        doc.font('Helvetica-Bold').fontSize(10).fillColor(C_BLACK)
        doc.text(`• ${p.description}`, { indent: 10 })
        doc.font('Helvetica').fontSize(9).fillColor(C_GRAY_MID)
        doc.text(
          `  Win rate: ${(p.winRate * 100).toFixed(0)}%  |  Avg P&L: ${p.avgPnLPct >= 0 ? '+' : ''}${p.avgPnLPct.toFixed(1)}%  |  Samples: ${p.sampleCount}  |  Action: ${p.action}`,
          { indent: 10 }
        )
        doc.moveDown(0.3)
      }
    }

    // ---- Lessons Learned ----
    const allLessons = weekEvals.flatMap((e) => e.lessonsLearned)
    const uniqueLessons = [...new Set(allLessons)].slice(0, 5)

    if (uniqueLessons.length > 0) {
      drawSectionTitle(doc, 'Lessons Learned')

      doc.font('Helvetica').fontSize(10).fillColor(C_BLACK)
      for (const lesson of uniqueLessons) {
        doc.text(`• ${lesson}`, { indent: 10 })
        doc.moveDown(0.2)
      }
    }

    // ---- Footer en todas las páginas (two-pass con bufferPages) ----
    const range = doc.bufferedPageRange()
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i)
      drawFooter(doc, i + 1, range.count)
    }

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

  const [agentLog, evaluations, patterns] = await Promise.all([
    getAgentLog(2000),
    getTradeEvaluations(500),
    getPatternLibrary(),
  ])

  const summary = calculateSummary(agentLog, evaluations, weekStart, weekEnd)
  const pdfBuffer = await generatePDF(summary, evaluations, patterns, weekStart, weekEnd)

  const filename = `report-${toDateString(weekStart)}_${toDateString(weekEnd)}.pdf`
  const db = createClient(supabaseUrl, serviceKey)
  const { error: uploadError } = await db.storage
    .from('weekly-reports')
    .upload(filename, pdfBuffer, { contentType: 'application/pdf', upsert: true })

  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`)

  const record = await insertWeeklyReport({
    weekStart: toDateString(weekStart),
    weekEnd: toDateString(weekEnd),
    storagePath: filename,
    summary,
  })

  return record
}
