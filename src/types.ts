export type ContestCategory =
  | 'freshman'
  | 'school'
  | 'icpc_regional'
  | 'ccpc_regional'
  | 'provincial'
  | 'lanqiao'
  | 'ladder'
  | 'other'

export interface Member {
  id: string
  name: string
  handle: string | null
  cohortYear: number
  className: string | null
  major: string | null
  joinedTeamYear: number | null
  isActive: boolean
  bio: string | null
  createdAt: string | null
}

export interface MemberMini {
  id: string
  name: string
  cohortYear: number
}

export interface Competition {
  id: string
  title: string
  category: ContestCategory
  seasonYear: number
  cohortYear: number | null
  contestLevel: string | null
  award: string | null
  rank: string | null
  teamName: string | null
  happenedAt: string | null
  remark: string | null
  createdAt: string | null
  participants: MemberMini[]
}

export interface MemberDetail extends Member {
  competitions: Competition[]
}

export interface HomeStats {
  membersCount: number
  activeMembersCount: number
  competitionsCount: number
  latestCompetitions: Competition[]
}

export interface AdminProfile {
  userId: string
  displayName: string | null
  isAdmin: boolean
}

export interface MemberDraft {
  name: string
  handle?: string
  cohortYear: number
  className?: string
  major?: string
  joinedTeamYear?: number
  isActive: boolean
  bio?: string
}

export interface CompetitionDraft {
  title: string
  category: ContestCategory
  seasonYear: number
  cohortYear?: number
  contestLevel?: string
  award?: string
  rank?: string
  teamName?: string
  happenedAt?: string
  remark?: string
  memberIds: string[]
}
