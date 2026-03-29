import type { LucideIcon } from 'lucide-react'
import {
  Braces,
  GraduationCap,
  Hexagon,
  Landmark,
  Medal,
  School,
  Trophy,
  WavesLadder,
} from 'lucide-react'
import { CONTEST_TYPE_LABELS } from '../lib/constants'
import type { ContestCategory } from '../types'

interface ContestTypeTagProps {
  category: ContestCategory
}

const CONTEST_TYPE_ICONS: Record<ContestCategory, LucideIcon> = {
  freshman: GraduationCap,
  school: School,
  icpc_regional: Trophy,
  ccpc_regional: Medal,
  provincial: Landmark,
  lanqiao: Braces,
  ladder: WavesLadder,
  other: Hexagon,
}

export function ContestTypeTag({ category }: ContestTypeTagProps) {
  const Icon = CONTEST_TYPE_ICONS[category]

  return (
    <span className={`contest-tag contest-tag-${category}`}>
      <Icon className="contest-tag-icon" size={12} strokeWidth={2.2} aria-hidden="true" />
      {CONTEST_TYPE_LABELS[category]}
    </span>
  )
}
