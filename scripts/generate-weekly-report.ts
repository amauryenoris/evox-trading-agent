import { generateAndSaveReport } from '../src/lib/report-generator.js'

async function main() {
  console.log('Generating weekly report...')
  const report = await generateAndSaveReport()
  console.log(`Report generated: ${report.id}`)
  console.log(`Week: ${report.weekStart} → ${report.weekEnd}`)
  console.log(`Storage path: ${report.storagePath}`)
  console.log(`P&L: ${report.summary.pnlUSD >= 0 ? '+' : ''}$${report.summary.pnlUSD.toFixed(2)} (${(report.summary.pnlPct * 100).toFixed(2)}%)`)
  process.exit(0)
}

main().catch((err) => {
  console.error('Report generation failed:', err)
  process.exit(1)
})
