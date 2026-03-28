import { CONTEST_TYPE_LABELS } from '../lib/constants'
import type { ContestCategory } from '../types'

interface ContestTypeTagProps {
  category: ContestCategory
}

export function ContestTypeTag({ category }: ContestTypeTagProps) {
  return (
    <span className={`contest-tag contest-tag-${category}`}>
      {CONTEST_TYPE_LABELS[category]}
    </span>
  )
}
