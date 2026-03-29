import type { LucideIcon } from 'lucide-react'
import { Award, BadgeCheck, Medal, Pin, Rocket, Star, Target, Trophy } from 'lucide-react'

type BadgeTone = 'gold' | 'silver' | 'bronze' | 'rose' | 'blue' | 'neutral'

type BadgeVisual = {
  Icon: LucideIcon
  tone: BadgeTone
}

function resolveAwardVisual(award: string): BadgeVisual {
  const normalized = award.trim().toLowerCase()

  if (/冠军|特等|金|一等奖|first|champion|gold/.test(normalized)) {
    return { Icon: Trophy, tone: 'gold' }
  }
  if (/亚军|银|二等奖|second|silver/.test(normalized)) {
    return { Icon: Medal, tone: 'silver' }
  }
  if (/季军|铜|三等奖|third|bronze/.test(normalized)) {
    return { Icon: Award, tone: 'bronze' }
  }
  if (/优秀|honorable|merit/.test(normalized)) {
    return { Icon: Star, tone: 'rose' }
  }
  if (/入围|finalist|提名|nominee/.test(normalized)) {
    return { Icon: BadgeCheck, tone: 'blue' }
  }

  return { Icon: Award, tone: 'neutral' }
}

function resolveRankVisual(rank: string): BadgeVisual {
  const normalized = rank.trim().toLowerCase()

  if (/冠军|first|1st/.test(normalized)) {
    return { Icon: Trophy, tone: 'gold' }
  }
  if (/亚军|second|2nd/.test(normalized)) {
    return { Icon: Medal, tone: 'silver' }
  }
  if (/季军|third|3rd/.test(normalized)) {
    return { Icon: Award, tone: 'bronze' }
  }

  const rankNumber = Number(rank.match(/\d+/)?.[0] ?? NaN)
  if (Number.isFinite(rankNumber)) {
    if (rankNumber === 1) {
      return { Icon: Trophy, tone: 'gold' }
    }
    if (rankNumber === 2) {
      return { Icon: Medal, tone: 'silver' }
    }
    if (rankNumber === 3) {
      return { Icon: Award, tone: 'bronze' }
    }
    if (rankNumber <= 10) {
      return { Icon: Target, tone: 'blue' }
    }
    if (rankNumber <= 50) {
      return { Icon: Rocket, tone: 'rose' }
    }
  }

  return { Icon: Pin, tone: 'neutral' }
}

type ResultBadgeProps = {
  text: string
  Icon: LucideIcon
  tone: BadgeTone
}

function ResultBadge({ text, Icon, tone }: ResultBadgeProps) {
  return (
    <span className={`result-badge result-badge-${tone}`}>
      <span className="result-badge-icon-wrap" aria-hidden="true">
        <Icon className="result-badge-icon" size={13} strokeWidth={2.1} />
      </span>
      <span className="result-badge-text">{text}</span>
    </span>
  )
}

export function AwardBadge({ award }: { award: string }) {
  const visual = resolveAwardVisual(award)
  return <ResultBadge text={award} Icon={visual.Icon} tone={visual.tone} />
}

export function RankBadge({ rank }: { rank: string }) {
  const visual = resolveRankVisual(rank)
  return <ResultBadge text={rank} Icon={visual.Icon} tone={visual.tone} />
}
