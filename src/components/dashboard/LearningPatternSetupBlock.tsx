'use client'

import type { BucketReport, DimensionReport, SetupTrackRecord } from '@/lib/pattern-stats'
import { filterDiagnostic } from '@/lib/pattern-schema'
import type { TradeSummary } from '@/lib/trade-views'
import { Badge, SignalBadge } from './ui'

const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ')

const LABEL_TEXT: Record<BucketReport['label'], string> = {
  INSUFFICIENT: 'too few trades',
  INCONCLUSIVE: 'inconclusive',
  DIFFERS_POS: 'differs (+)',
  DIFFERS_NEG: 'differs (-)',
}

const FORWARD_VERDICT_TEXT: Record<BucketReport['forwardVerdict'], string> = {
  PENDING: 'forward: pending (n<5)',
  CONSISTENT: 'consistent so far',
  CONTRADICTED: 'contradicted',
}

function fmtPct(n: number | null): string {
  return n === null ? '—' : (n >= 0 ? '+' : '') + n.toFixed(2) + '%'
}

function fmtRate(rate: number | null): string {
  return rate === null ? '—' : (rate * 100).toFixed(0) + '%'
}

function SummaryLine({ summary }: { summary: TradeSummary }) {
  return (
    <span className="num">
      n {summary.n} · win {fmtRate(summary.winRate)} · avg {fmtPct(summary.avgPnlPct)} · median{' '}
      {fmtPct(summary.medianPnlPct)} · worst {fmtPct(summary.worstPnlPct)}
    </span>
  )
}

function BucketTable({ dimension }: { dimension: DimensionReport }) {
  const isExploratory = dimension.kind === 'exploratory'

  return (
    <div className={cx('space-y-1.5', isExploratory && 'opacity-60')}>
      <div className="text-[11px] text-muted">
        baseline: <SummaryLine summary={dimension.baseline} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11.5px] num">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1 pr-3 font-medium">bucket</th>
              <th className="py-1 pr-3 font-medium text-right">n</th>
              <th className="py-1 pr-3 font-medium text-right">win</th>
              <th className="py-1 pr-3 font-medium text-right">avg</th>
              <th className="py-1 pr-3 font-medium text-right">shrunk avg</th>
              <th className="py-1 pr-3 font-medium text-right">95% CI</th>
              <th className="py-1 pr-3 font-medium">label</th>
              <th className="py-1 pr-3 font-medium text-right">hist / fwd n</th>
              <th className="py-1 font-medium">forward</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {dimension.buckets.map((b) => (
              <tr key={b.bucket}>
                <td className="py-1 pr-3 text-text">{b.bucket}</td>
                <td className="py-1 pr-3 text-right">{b.summary.n}</td>
                <td className="py-1 pr-3 text-right">{fmtRate(b.summary.winRate)}</td>
                <td className="py-1 pr-3 text-right">{fmtPct(b.summary.avgPnlPct)}</td>
                <td className="py-1 pr-3 text-right">{fmtPct(b.shrunkAvgPnl)}</td>
                <td className="py-1 pr-3 text-right">{fmtPct(b.ci95.lower)} – {fmtPct(b.ci95.upper)}</td>
                <td className="py-1 pr-3">{LABEL_TEXT[b.label]}</td>
                <td className="py-1 pr-3 text-right">{b.historical.n} / {b.forward.n}</td>
                <td className="py-1">{FORWARD_VERDICT_TEXT[b.forwardVerdict]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DimensionRow({ dimension }: { dimension: DimensionReport }) {
  const isExploratory = dimension.kind === 'exploratory'

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-[12px]">
        <span className="font-medium text-text">{dimension.dimension}</span>
        <Badge tone={isExploratory ? 'amber' : 'blue'} size="xs">{dimension.kind}</Badge>
      </div>
      {dimension.skipped && <p className="text-[11px] text-muted">skipped: {dimension.reason}</p>}
      {!dimension.skipped && !dimension.viable && <p className="text-[11px] text-muted">{dimension.reason}</p>}
      {dimension.viable && <BucketTable dimension={dimension} />}
    </div>
  )
}

interface Props {
  record: SetupTrackRecord
  dimensions: DimensionReport[]
}

export function LearningPatternSetupBlock({ record, dimensions }: Props) {
  const { baseline, fingerprintCoverage, ruleVersions } = record
  // filterDiagnostic is typed for bare schema entries; it only filters, so the full reports survive at runtime.
  const visibleDimensions = filterDiagnostic(dimensions) as DimensionReport[]

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <SignalBadge signal={record.setup} size="sm" />
          <span className="text-[12px] text-mute2">
            <SummaryLine summary={baseline} />
          </span>
        </div>
        <p className="text-[11px] text-muted">
          fingerprint: {fingerprintCoverage.stored} stored / {fingerprintCoverage.recomputed} recomputed /{' '}
          {fingerprintCoverage.missing} missing
        </p>
      </div>

      <div className="space-y-3">
        {visibleDimensions.map((dimension) => (
          <DimensionRow key={dimension.dimension} dimension={dimension} />
        ))}
      </div>

      {ruleVersions.length > 0 && (
        <div className="space-y-0.5">
          {ruleVersions.map((rv) => (
            <p key={`${rv.effectiveDate}-${rv.label}`} className="text-[11px] text-muted num">
              {rv.effectiveDate} {rv.label}: {rv.before.n} before / {rv.after.n} after
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
