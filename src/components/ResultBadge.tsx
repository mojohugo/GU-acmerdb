type BadgeTone = 'gold' | 'silver' | 'bronze' | 'rose' | 'blue' | 'neutral'

function resolveAwardVisual(award: string): { icon: string; tone: BadgeTone } {
  const normalized = award.trim().toLowerCase()

  if (/冠军|特等|金|一等奖|first|champion|gold/.test(normalized)) {
    return { icon: '🏆', tone: 'gold' }
  }
  if (/亚军|银|二等奖|second|silver/.test(normalized)) {
    return { icon: '🥈', tone: 'silver' }
  }
  if (/季军|铜|三等奖|third|bronze/.test(normalized)) {
    return { icon: '🥉', tone: 'bronze' }
  }
  if (/优秀|honorable|merit/.test(normalized)) {
    return { icon: '🌟', tone: 'rose' }
  }
  if (/入围|finalist|提名|nominee/.test(normalized)) {
    return { icon: '🎖️', tone: 'blue' }
  }

  return { icon: '🏅', tone: 'neutral' }
}

function resolveRankVisual(rank: string): { icon: string; tone: BadgeTone } {
  const normalized = rank.trim().toLowerCase()

  if (/冠军|first|1st/.test(normalized)) {
    return { icon: '🥇', tone: 'gold' }
  }
  if (/亚军|second|2nd/.test(normalized)) {
    return { icon: '🥈', tone: 'silver' }
  }
  if (/季军|third|3rd/.test(normalized)) {
    return { icon: '🥉', tone: 'bronze' }
  }

  const rankNumber = Number(rank.match(/\d+/)?.[0] ?? NaN)
  if (Number.isFinite(rankNumber)) {
    if (rankNumber <= 3) {
      return { icon: ['🥇', '🥈', '🥉'][rankNumber - 1], tone: ['gold', 'silver', 'bronze'][rankNumber - 1] as BadgeTone }
    }
    if (rankNumber <= 10) {
      return { icon: '🎯', tone: 'blue' }
    }
    if (rankNumber <= 50) {
      return { icon: '🚀', tone: 'rose' }
    }
  }

  return { icon: '📌', tone: 'neutral' }
}

type ResultBadgeProps = {
  text: string
  icon: string
  tone: BadgeTone
}

function ResultBadge({ text, icon, tone }: ResultBadgeProps) {
  return (
    <span className={`result-badge result-badge-${tone}`}>
      <span className="result-badge-icon" aria-hidden="true">
        {icon}
      </span>
      <span>{text}</span>
    </span>
  )
}

export function AwardBadge({ award }: { award: string }) {
  const visual = resolveAwardVisual(award)
  return <ResultBadge text={award} icon={visual.icon} tone={visual.tone} />
}

export function RankBadge({ rank }: { rank: string }) {
  const visual = resolveRankVisual(rank)
  return <ResultBadge text={rank} icon={visual.icon} tone={visual.tone} />
}
