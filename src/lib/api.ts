import type { Session } from '@supabase/supabase-js'
import { CONTEST_TYPE_ORDER } from './constants'
import {
  fetchWithCache,
  invalidateCacheByPrefix,
  invalidateCacheKey,
  peekCachedValue,
} from './queryCache'
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

export type MemberFilters = {
  query?: string
  cohortYear?: number
  isActive?: boolean
}

export type MemberSortField = 'cohort_year' | 'name' | 'created_at'

export type SortDirection = 'asc' | 'desc'

export type MemberPageQuery = MemberFilters & {
  page?: number
  pageSize?: number
  sortBy?: MemberSortField
  sortDirection?: SortDirection
}

export type PagedResult<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

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

const MEMBERS_CACHE_PREFIX = 'members:'
const MEMBER_PAGES_CACHE_PREFIX = 'member-pages:'
const AVAILABLE_COHORTS_CACHE_KEY = 'available-cohorts'
const MEMBER_DETAIL_CACHE_PREFIX = 'member-detail:'
const COHORT_OVERVIEW_CACHE_KEY = 'cohort-overview'
const HOME_STATS_CACHE_KEY = 'home-stats'

const MEMBERS_CACHE_TTL_MS = 60_000
const MEMBER_PAGES_CACHE_TTL_MS = 60_000
const AVAILABLE_COHORTS_CACHE_TTL_MS = 5 * 60_000
const MEMBER_DETAIL_CACHE_TTL_MS = 2 * 60_000
const COHORT_OVERVIEW_CACHE_TTL_MS = 60_000
const HOME_STATS_CACHE_TTL_MS = 60_000

const DEFAULT_MEMBERS_PAGE = 1
const DEFAULT_MEMBERS_PAGE_SIZE = 20
const MAX_MEMBERS_PAGE_SIZE = 100
const DEFAULT_MEMBER_SORT_BY: MemberSortField = 'cohort_year'
const DEFAULT_MEMBER_SORT_DIRECTION: SortDirection = 'desc'

function normalizeMembersFilters(filters?: MemberFilters) {
  return {
    query: filters?.query?.trim().toLowerCase() ?? '',
    cohortYear: filters?.cohortYear ?? null,
    isActive:
      filters?.isActive === undefined ? 'all' : filters.isActive ? 'active' : 'inactive',
  }
}

function toSafePage(input: number | undefined) {
  if (!Number.isFinite(input)) {
    return DEFAULT_MEMBERS_PAGE
  }

  const rounded = Math.floor(input as number)
  return rounded > 0 ? rounded : DEFAULT_MEMBERS_PAGE
}

function toSafePageSize(input: number | undefined) {
  if (!Number.isFinite(input)) {
    return DEFAULT_MEMBERS_PAGE_SIZE
  }

  const rounded = Math.floor(input as number)
  if (rounded <= 0) {
    return DEFAULT_MEMBERS_PAGE_SIZE
  }

  return Math.min(rounded, MAX_MEMBERS_PAGE_SIZE)
}

function normalizeSortBy(input: MemberSortField | undefined): MemberSortField {
  if (input === 'name' || input === 'created_at' || input === 'cohort_year') {
    return input
  }

  return DEFAULT_MEMBER_SORT_BY
}

function normalizeSortDirection(input: SortDirection | undefined): SortDirection {
  if (input === 'asc' || input === 'desc') {
    return input
  }

  return DEFAULT_MEMBER_SORT_DIRECTION
}

function normalizeMembersPageQuery(query?: MemberPageQuery) {
  const normalizedFilters = normalizeMembersFilters(query)

  return {
    query: normalizedFilters.query,
    cohortYear: normalizedFilters.cohortYear,
    isActive: normalizedFilters.isActive,
    page: toSafePage(query?.page),
    pageSize: toSafePageSize(query?.pageSize),
    sortBy: normalizeSortBy(query?.sortBy),
    sortDirection: normalizeSortDirection(query?.sortDirection),
  } as const
}

function toMembersCacheKey(filters?: MemberFilters) {
  const normalized = normalizeMembersFilters(filters)
  return `${MEMBERS_CACHE_PREFIX}${JSON.stringify(normalized)}`
}

function toMembersPageCacheKey(query?: MemberPageQuery) {
  const normalized = normalizeMembersPageQuery(query)
  return `${MEMBER_PAGES_CACHE_PREFIX}${JSON.stringify(normalized)}`
}

function toMemberDetailCacheKey(memberId: string) {
  return `${MEMBER_DETAIL_CACHE_PREFIX}${memberId}`
}

function invalidateMemberRelatedCache() {
  invalidateCacheByPrefix(MEMBERS_CACHE_PREFIX)
  invalidateCacheByPrefix(MEMBER_PAGES_CACHE_PREFIX)
  invalidateCacheKey(AVAILABLE_COHORTS_CACHE_KEY)
  invalidateCacheByPrefix(MEMBER_DETAIL_CACHE_PREFIX)
  invalidateCacheKey(COHORT_OVERVIEW_CACHE_KEY)
  invalidateCacheKey(HOME_STATS_CACHE_KEY)
}

function invalidateCompetitionRelatedCache() {
  invalidateCacheKey(COHORT_OVERVIEW_CACHE_KEY)
  invalidateCacheByPrefix(MEMBER_DETAIL_CACHE_PREFIX)
  invalidateCacheKey(HOME_STATS_CACHE_KEY)
}

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

export function peekMembers(filters?: MemberFilters) {
  return peekCachedValue<Member[]>(toMembersCacheKey(filters))
}

export function peekMembersPage(query?: MemberPageQuery) {
  return peekCachedValue<PagedResult<Member>>(toMembersPageCacheKey(query))
}

export function peekAvailableCohorts() {
  return peekCachedValue<number[]>(AVAILABLE_COHORTS_CACHE_KEY)
}

export function peekMemberDetail(memberId: string) {
  return peekCachedValue<MemberDetail>(toMemberDetailCacheKey(memberId))
}

export function peekCohortOverview() {
  return peekCachedValue<Competition[]>(COHORT_OVERVIEW_CACHE_KEY)
}

export function peekHomeStats() {
  return peekCachedValue<HomeStats>(HOME_STATS_CACHE_KEY)
}

export function warmPublicData() {
  return Promise.allSettled([
    fetchHomeStats(),
    fetchMembers(),
    fetchAvailableCohorts(),
    fetchCohortOverview(),
  ])
}

export async function fetchMembers(filters?: MemberFilters) {
  const cacheKey = toMembersCacheKey(filters)

  return fetchWithCache({
    key: cacheKey,
    ttlMs: MEMBERS_CACHE_TTL_MS,
    fetcher: async () => {
      const client = getSupabaseClient()

      let membersQuery = client
        .from('members')
        .select('*')
        .order('cohort_year', { ascending: false })
        .order('name', { ascending: true })

      if (filters?.cohortYear) {
        membersQuery = membersQuery.eq('cohort_year', filters.cohortYear)
      }

      if (filters?.isActive !== undefined) {
        membersQuery = membersQuery.eq('is_active', filters.isActive)
      }

      if (filters?.query && filters.query.trim().length > 0) {
        const keyword = filters.query.trim()
        membersQuery = membersQuery.or(`name.ilike.%${keyword}%,handle.ilike.%${keyword}%`)
      }

      const { data, error } = await membersQuery

      if (error) {
        throw error
      }

      return (data ?? []).map((row) => mapMember(row as Record<string, unknown>))
    },
  })
}

export async function fetchMembersPage(
  query?: MemberPageQuery,
): Promise<PagedResult<Member>> {
  const normalized = normalizeMembersPageQuery(query)
  const cacheKey = `${MEMBER_PAGES_CACHE_PREFIX}${JSON.stringify(normalized)}`

  return fetchWithCache({
    key: cacheKey,
    ttlMs: MEMBER_PAGES_CACHE_TTL_MS,
    fetcher: async () => {
      const client = getSupabaseClient()
      const from = (normalized.page - 1) * normalized.pageSize
      const to = from + normalized.pageSize - 1

      let membersQuery = client
        .from('members')
        .select('*', { count: 'exact' })
        .range(from, to)

      if (normalized.cohortYear) {
        membersQuery = membersQuery.eq('cohort_year', normalized.cohortYear)
      }

      if (normalized.isActive !== 'all') {
        membersQuery = membersQuery.eq('is_active', normalized.isActive === 'active')
      }

      if (normalized.query.length > 0) {
        membersQuery = membersQuery.or(
          `name.ilike.%${normalized.query}%,handle.ilike.%${normalized.query}%`,
        )
      }

      const ascending = normalized.sortDirection === 'asc'

      if (normalized.sortBy === 'name') {
        membersQuery = membersQuery
          .order('name', { ascending })
          .order('cohort_year', { ascending: false })
      } else if (normalized.sortBy === 'created_at') {
        membersQuery = membersQuery
          .order('created_at', { ascending })
          .order('cohort_year', { ascending: false })
      } else {
        membersQuery = membersQuery
          .order('cohort_year', { ascending })
          .order('name', { ascending: true })
      }

      const { data, error, count } = await membersQuery

      if (error) {
        throw error
      }

      const total = count ?? 0
      const pageCount = total > 0 ? Math.ceil(total / normalized.pageSize) : 1

      return {
        items: (data ?? []).map((row) => mapMember(row as Record<string, unknown>)),
        total,
        page: normalized.page,
        pageSize: normalized.pageSize,
        pageCount,
      }
    },
  })
}

export async function fetchAvailableCohorts() {
  return fetchWithCache({
    key: AVAILABLE_COHORTS_CACHE_KEY,
    ttlMs: AVAILABLE_COHORTS_CACHE_TTL_MS,
    fetcher: async () => {
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
    },
  })
}

export async function fetchMemberDetail(memberId: string): Promise<MemberDetail> {
  return fetchWithCache({
    key: toMemberDetailCacheKey(memberId),
    ttlMs: MEMBER_DETAIL_CACHE_TTL_MS,
    fetcher: async () => {
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
    },
  })
}

export async function fetchCohortOverview() {
  return fetchWithCache({
    key: COHORT_OVERVIEW_CACHE_KEY,
    ttlMs: COHORT_OVERVIEW_CACHE_TTL_MS,
    fetcher: async () => {
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
    },
  })
}

export async function fetchHomeStats(): Promise<HomeStats> {
  return fetchWithCache({
    key: HOME_STATS_CACHE_KEY,
    ttlMs: HOME_STATS_CACHE_TTL_MS,
    fetcher: async () => {
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
    },
  })
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

  const created = mapMember(data as unknown as Record<string, unknown>)
  invalidateMemberRelatedCache()
  return created
}

export async function updateMember(memberId: string, input: MemberDraft) {
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
    .update(payload)
    .eq('id', memberId)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  const updated = mapMember(data as unknown as Record<string, unknown>)
  invalidateMemberRelatedCache()
  return updated
}

export async function deleteMember(memberId: string) {
  const client = getSupabaseClient()
  const { error } = await client.from('members').delete().eq('id', memberId)

  if (error) {
    throw error
  }

  invalidateMemberRelatedCache()
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

  invalidateCompetitionRelatedCache()
  return competitionId
}

export async function updateCompetition(
  competitionId: string,
  input: CompetitionDraft,
) {
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

  const { error: updateError } = await client
    .from('competitions')
    .update(payload)
    .eq('id', competitionId)

  if (updateError) {
    throw updateError
  }

  const { error: clearLinksError } = await client
    .from('competition_members')
    .delete()
    .eq('competition_id', competitionId)

  if (clearLinksError) {
    throw clearLinksError
  }

  if (input.memberIds.length > 0) {
    const links = input.memberIds.map((memberId) => ({
      competition_id: competitionId,
      member_id: memberId,
    }))

    const { error: insertLinksError } = await client
      .from('competition_members')
      .insert(links)

    if (insertLinksError) {
      throw insertLinksError
    }
  }

  invalidateCompetitionRelatedCache()
}

export async function deleteCompetition(competitionId: string) {
  const client = getSupabaseClient()
  const { error } = await client
    .from('competitions')
    .delete()
    .eq('id', competitionId)

  if (error) {
    throw error
  }

  invalidateCompetitionRelatedCache()
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
