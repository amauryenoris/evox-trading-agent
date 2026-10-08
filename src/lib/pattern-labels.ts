import { MIN_BUCKET_N } from './trade-views'

export const SHRINK_K = 15

// Two-tailed 95% Student-t critical values for df 1..30 (index 0 = df 1). Beyond df 30 the
// normal approximation (1.96) is close enough that a longer table buys nothing here.
const T_TABLE_DF_1_TO_30 = [
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228,
  2.201, 2.179, 2.160, 2.145, 2.131, 2.120, 2.110, 2.101, 2.093, 2.086,
  2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042,
]

export function tCriticalValue(df: number): number {
  if (df < 1) return T_TABLE_DF_1_TO_30[0]
  if (df > 30) return 1.96
  return T_TABLE_DF_1_TO_30[Math.floor(df) - 1]
}

export interface ConfidenceInterval {
  mean: number
  lower: number
  upper: number
}

export function confidenceInterval95(values: number[]): ConfidenceInterval {
  const n = values.length
  const mean = values.reduce((sum, v) => sum + v, 0) / n
  if (n < 2) return { mean, lower: mean, upper: mean }

  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1)
  const standardError = Math.sqrt(variance) / Math.sqrt(n)
  const margin = tCriticalValue(n - 1) * standardError
  return { mean, lower: mean - margin, upper: mean + margin }
}

export function shrink(bucketAvg: number, bucketN: number, setupAvg: number, shrinkK = SHRINK_K): number {
  return (bucketN * bucketAvg + shrinkK * setupAvg) / (bucketN + shrinkK)
}

export type BucketLabel = 'INSUFFICIENT' | 'INCONCLUSIVE' | 'DIFFERS_POS' | 'DIFFERS_NEG'

export function labelBucket(ci: ConfidenceInterval, baselineAvg: number, n: number): BucketLabel {
  if (n < MIN_BUCKET_N) return 'INSUFFICIENT'
  if (baselineAvg >= ci.lower && baselineAvg <= ci.upper) return 'INCONCLUSIVE'
  return baselineAvg < ci.lower ? 'DIFFERS_POS' : 'DIFFERS_NEG'
}
