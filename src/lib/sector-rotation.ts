const LOOKBACK_DAYS = 20

export interface SectorRotationSnapshot {
  gdx_relative_strength_pct: number | null
  xle_relative_strength_pct: number | null
  xlk_relative_strength_pct: number | null
}

function relativeReturnPct(bars: { c: number }[]): number | null {
  if (bars.length < LOOKBACK_DAYS + 2) return null
  const refIndex = bars.length - 2
  const currentClose = bars[refIndex].c
  const pastClose = bars[refIndex - LOOKBACK_DAYS].c
  if (pastClose === 0) return null
  return ((currentClose - pastClose) / pastClose) * 100
}

export function computeSectorRotation(
  gdxBars: { t: string; c: number }[],
  xleBars: { t: string; c: number }[],
  xlkBars: { t: string; c: number }[],
  spyBars: { t: string; c: number }[]
): SectorRotationSnapshot {
  const spyReturn = relativeReturnPct(spyBars)
  if (spyReturn === null) {
    return { gdx_relative_strength_pct: null, xle_relative_strength_pct: null, xlk_relative_strength_pct: null }
  }

  const relativeStrength = (sectorBars: { c: number }[]): number | null => {
    const sectorReturn = relativeReturnPct(sectorBars)
    return sectorReturn === null ? null : sectorReturn - spyReturn
  }

  return {
    gdx_relative_strength_pct: relativeStrength(gdxBars),
    xle_relative_strength_pct: relativeStrength(xleBars),
    xlk_relative_strength_pct: relativeStrength(xlkBars),
  }
}

export function formatSectorRotationContext(snapshot: SectorRotationSnapshot): string {
  const label = (name: string, val: number | null) =>
    val === null ? `${name}: no data` : `${name}: ${val >= 0 ? '+' : ''}${val.toFixed(2)}% vs SPY (20d)`

  return [
    label('Gold/Mining (GDX)', snapshot.gdx_relative_strength_pct),
    label('Energy (XLE)', snapshot.xle_relative_strength_pct),
    label('Technology (XLK)', snapshot.xlk_relative_strength_pct),
  ].join('\n')
}
