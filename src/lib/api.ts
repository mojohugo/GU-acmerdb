import type { Session } from '@supabase/supabase-js'
import { CONTEST_TYPE_ORDER } from './constants'
import { getSupabaseClient } from './supabase'
import type {
  AdminProfile,
  Competition,
  CompetitionDraft,
  ContestCategory,
  HomeStats,
  Member,
  MemberDetail,
  MemberDraft,
  MemberMini,
} from '../types'

const competitionFields = [
  'id',
  'title',
  'category',
  'season_year',
  'cohort_year',
  'contest_level',
  'award',
  'rank',
  'team_name',
  'happened_at',
  'remark',
  'created_at',
].join(',')

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asBoolean(value: unknown): boolean {
  return value === true
}

function asCategory(value: unknown): ContestCategory {
  if (typeof value !== 'string') {
    return 'other'
  }

  return CONTEST_TYPE_ORDER.includes(value as ContestCategory)
    ? (value as ContestCategory)
    : 'other'
}

function mapMember(row: Record<string, unknown>): Member {
  return {
    id: asString(row.id) ?? '',
    name: asString(row.name) ?? '未命名成员',
    handle: asString(row.handle),
    cohortYear: asNumber(row.cohort_year) ?? 0,
    className: asString(row.class_name),
    major: asString(row.major),
    joinedTeamYear: asNumber(row.joined_team_year),
    isActive: asBoolean(row.is_active),
    bio: asString(row.bio),
    createdAt: asString(row.created_at),
  }
}

function mapMemberMini(row: Record<string, unknown>): MemberMini {
  return {
    id: asString(row.id) ?? '',
    name: asString(row.name) ?? '未知成员',
    cohortYear: asNumber(row.cohort_year) ?? 0,
  }
}

function mapCompetition(
  row: Record<string, unknown>,
  participants: MemberMini[] = [],
): Competition {
  return {
    id: asString(row.id) ?? '',
    title: asString(row.title) ?? '未命名赛事',
    category: asCategory(row.category),
    seasonYear: asNumber(row.season_year) ?? 0,
    cohortYear: asNumber(row.cohort_year),
    contestLevel: asString(row.contest_level),
    award: asString(row.award),
    rank: asString(row.rank),
    teamName: asString(row.team_name),
    happenedAt: asString(row.happened_at),
    remark: asString(row.remark),
    createdAt: asString(row.created_at),
    participants,
  }
}

function sortCompetitionDesc(a: Competition, b: Competition): number {
  const aTime = a.happenedAt ? Date.parse(a.happenedAt) : 0
  const bTime = b.happenedAt ? Date.parse(b.happenedAt) : 0

  if (aTime !== bTime) {
    return bTime - aTime
  }

  return b.seasonYear - a.seasonYear
}

export async function fetchMembers(filters?: {
  query?: string
  cohortYear?: number
  isActive?: boolean
}) {
  const client = getSupabaseClient()

  let query = client
    .from('members')
    .select('*')
    .order('cohort_year', { ascending: false })
    .order('name', { ascending: true })

  if (filters?.cohortYear) {
    query = query.eq('cohort_year', filters.cohortYear)
  }

  if (filters?.isActive !== undefined) {
    query = query.eq('is_active', filters.isActive)
  }

  if (filters?.query && filters.query.trim().length > 0) {
    const keyword = filters.query.trim()
    query = query.or(`name.ilike.%${keyword}%,handle.ilike.%${keyword}%`)
  }

  const { data, error } = await query

  if (error) {
    throw error
  }

  return (data ?? []).map((row) => mapMember(row as Record<string, unknown>))
}

export async function fetchAvailableCohorts() {
  const client = getSupabaseClient()
  const { data, error } = await client
    .from('members')
    .select('cohort_year')
    .order('cohort_year', { ascending: false })

  if (error) {
    throw error
  }

  const all = (data ?? [])
    .map((row) => asNumber((row as Record<string, unknown>).cohort_year))
    .filter((year): year is number => year !== null && year > 0)

  return [...new Set(all)]
}

export async function fetchMemberDetail(memberId: string): Promise<MemberDetail> {
  const client = getSupabaseClient()
  const { data: memberRow, error: memberError } = await client
    .from('members')
    .select('*')
    .eq('id', memberId)
    .single()

  if (memberError) {
    throw memberError
  }

  const { data: links, error: linkError } = await client
    .from('competition_members')
    .select('competition_id')
    .eq('member_id', memberId)

  if (linkError) {
    throw linkError
  }

  const competitionIds = (links ?? [])
    .map((row) => asString((row as Record<string, unknown>).competition_id))
    .filter((id): id is string => Boolean(id))

  let competitions: Competition[] = []

  if (competitionIds.length > 0) {
    const { data: competitionRows, error: competitionError } = await client
      .from('competitions')
      .select(competitionFields)
      .in('id', competitionIds)

    if (competitionError) {
      throw competitionError
    }

    competitions = (competitionRows ?? [])
      .map((row) => mapCompetition(row as unknown as Record<string, unknown>))
      .sort(sortCompetitionDesc)
  }

  return {
    ...mapMember(memberRow as unknown as Record<string, unknown>),
    competitions,
  }
}

export async function fetchCohortOverview() {
  const client = getSupabaseClient()
  const { data, error } = await client
    .from('competitions')
    .select(competitionFields)
    .order('happened_at', { ascending: false })
    .order('season_year', { ascending: false })

  if (error) {
    throw error
  }

  const { data: links, error: linkError } = await client
    .from('competition_members')
    .select('competition_id,member_id')

  if (linkError) {
    throw linkError
  }

  const memberIds = [...new Set(
    (links ?? [])
      .map((row) => asString((row as Record<string, unknown>).member_id))
      .filter((id): id is string => Boolean(id)),
  )]

  const memberMap = new Map<string, MemberMini>()
  if (memberIds.length > 0) {
    const { data: members, error: membersError } = await client
      .from('members')
      .select('id,name,cohort_year')
      .in('id', memberIds)

    if (membersError) {
      throw membersError
    }

    for (const row of members ?? []) {
      const mapped = mapMemberMini(row as unknown as Record<string, unknown>)
      if (mapped.id) {
        memberMap.set(mapped.id, mapped)
      }
    }
  }

  const participantsByCompetition = new Map<string, MemberMini[]>()
  for (const row of links ?? []) {
    const link = row as Record<string, unknown>
    const competitionId = asString(link.competition_id)
    const memberId = asString(link.member_id)
    const member = memberId ? memberMap.get(memberId) : undefined

    if (!competitionId || !member) {
      continue
    }

    if (!participantsByCompetition.has(competitionId)) {
      participantsByCompetition.set(competitionId, [])
    }

    participantsByCompetition.get(competitionId)?.push(member)
  }

  return (data ?? [])
    .map((row) => {
      const mapped = mapCompetition(row as unknown as Record<string, unknown>)
      return {
        ...mapped,
        participants: participantsByCompetition.get(mapped.id) ?? [],
      }
    })
    .sort(sortCompetitionDesc)
}

export async function fetchHomeStats(): Promise<HomeStats> {
  const client = getSupabaseClient()

  const [membersRes, activeMembersRes, competitionsRes, latestRes] =
    await Promise.all([
      client.from('members').select('id', { count: 'exact', head: true }),
      client
        .from('members')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true),
      client.from('competitions').select('id', { count: 'exact', head: true }),
      client
        .from('competitions')
        .select(competitionFields)
        .order('happened_at', { ascending: false })
        .order('season_year', { ascending: false })
        .limit(8),
    ])

  if (membersRes.error) {
    throw membersRes.error
  }

  if (activeMembersRes.error) {
    throw activeMembersRes.error
  }

  if (competitionsRes.error) {
    throw competitionsRes.error
  }

  if (latestRes.error) {
    throw latestRes.error
  }

  return {
    membersCount: membersRes.count ?? 0,
    activeMembersCount: activeMembersRes.count ?? 0,
    competitionsCount: competitionsRes.count ?? 0,
    latestCompetitions: (latestRes.data ?? [])
      .map((row) => mapCompetition(row as unknown as Record<string, unknown>))
      .sort(sortCompetitionDesc),
  }
}

export async function getCurrentSession() {
  const client = getSupabaseClient()
  const { data, error } = await client.auth.getSession()

  if (error) {
    throw error
  }

  return data.session
}

export async function fetchAdminProfile(userId: string) {
  const client = getSupabaseClient()
  const { data, error } = await client
    .from('admin_users')
    .select('user_id,display_name,is_admin')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    return null
  }

  const row = data as unknown as Record<string, unknown>
  const profile: AdminProfile = {
    userId: asString(row.user_id) ?? userId,
    displayName: asString(row.display_name),
    isAdmin: asBoolean(row.is_admin),
  }

  return profile
}

export async function requireAdmin(userId: string) {
  const profile = await fetchAdminProfile(userId)

  if (!profile?.isAdmin) {
    throw new Error('当前账号不是管理员，请在 admin_users 表配置 is_admin=true')
  }

  return profile
}

export async function signInAsAdmin(email: string, password: string) {
  const client = getSupabaseClient()
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    throw error
  }

  if (!data.user) {
    throw new Error('登录成功但未获取到用户信息')
  }

  const profile = await requireAdmin(data.user.id)

  return {
    session: data.session,
    profile,
  }
}

export async function signOutAdmin() {
  const client = getSupabaseClient()
  const { error } = await client.auth.signOut()

  if (error) {
    throw error
  }
}

export async function createMember(input: MemberDraft) {
  const client = getSupabaseClient()

  const payload = {
    name: input.name.trim(),
    handle: input.handle?.trim() || null,
    cohort_year: input.cohortYear,
    class_name: input.className?.trim() || null,
    major: input.major?.trim() || null,
    joined_team_year: input.joinedTeamYear ?? null,
    is_active: input.isActive,
    bio: input.bio?.trim() || null,
  }

  const { data, error } = await client
    .from('members')
    .insert(payload)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return mapMember(data as unknown as Record<string, unknown>)
}

export async function createCompetition(input: CompetitionDraft) {
  const client = getSupabaseClient()

  const payload = {
    title: input.title.trim(),
    category: input.category,
    season_year: input.seasonYear,
    cohort_year: input.cohortYear ?? null,
    contest_level: input.contestLevel?.trim() || null,
    award: input.award?.trim() || null,
    rank: input.rank?.trim() || null,
    team_name: input.teamName?.trim() || null,
    happened_at: input.happenedAt || null,
    remark: input.remark?.trim() || null,
  }

  const { data: inserted, error: insertError } = await client
    .from('competitions')
    .insert(payload)
    .select('id')
    .single()

  if (insertError) {
    throw insertError
  }

  const insertedRow = inserted as unknown as Record<string, unknown>
  const competitionId = asString(insertedRow.id)

  if (!competitionId) {
    throw new Error('赛事创建后未返回主键 ID')
  }

  if (input.memberIds.length > 0) {
    const links = input.memberIds.map((memberId) => ({
      competition_id: competitionId,
      member_id: memberId,
    }))

    const { error: linkError } = await client
      .from('competition_members')
      .insert(links)

    if (linkError) {
      throw linkError
    }
  }

  return competitionId
}

export async function getAdminSessionWithProfile(): Promise<{
  session: Session | null
  profile: AdminProfile | null
}> {
  const session = await getCurrentSession()

  if (!session?.user) {
    return { session: null, profile: null }
  }

  try {
    const profile = await requireAdmin(session.user.id)
    return { session, profile }
  } catch {
    return { session, profile: null }
  }
}
