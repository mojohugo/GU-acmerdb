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
  CompetitionDetail,
  CompetitionDraft,
  CompetitionMedia,
  CompetitionMediaType,
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

const competitionFieldsWithParticipants =
  `${competitionFields},competition_members(member_id,members(id,name,cohort_year))`

const competitionMediaFields = [
  'id',
  'competition_id',
  'standing_competition_id',
  'media_type',
  'file_name',
  'object_key',
  'mime_type',
  'file_size',
  'url',
  'remark',
  'created_at',
].join(',')

const MEMBERS_CACHE_PREFIX = 'members:'
const MEMBER_PAGES_CACHE_PREFIX = 'member-pages:'
const AVAILABLE_COHORTS_CACHE_KEY = 'available-cohorts'
const MEMBER_DETAIL_CACHE_PREFIX = 'member-detail:'
const COMPETITION_DETAIL_CACHE_PREFIX = 'competition-detail:'
const COHORT_OVERVIEW_CACHE_KEY = 'cohort-overview'
const COHORT_TIMELINE_CACHE_KEY = 'cohort-timeline'
const AWARDS_OVERVIEW_CACHE_KEY = 'awards-overview'
const HOME_STATS_CACHE_KEY = 'home-stats'

const MEMBERS_CACHE_TTL_MS = 60_000
const MEMBER_PAGES_CACHE_TTL_MS = 60_000
const AVAILABLE_COHORTS_CACHE_TTL_MS = 5 * 60_000
const MEMBER_DETAIL_CACHE_TTL_MS = 2 * 60_000
const COMPETITION_DETAIL_CACHE_TTL_MS = 2 * 60_000
const COHORT_OVERVIEW_CACHE_TTL_MS = 60_000
const COHORT_TIMELINE_CACHE_TTL_MS = 60_000
const AWARDS_OVERVIEW_CACHE_TTL_MS = 5 * 60_000
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

function toCompetitionDetailCacheKey(competitionId: string) {
  return `${COMPETITION_DETAIL_CACHE_PREFIX}${competitionId}`
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
  invalidateCacheKey(COHORT_TIMELINE_CACHE_KEY)
  invalidateCacheKey(AWARDS_OVERVIEW_CACHE_KEY)
  invalidateCacheByPrefix(MEMBER_DETAIL_CACHE_PREFIX)
  invalidateCacheByPrefix(COMPETITION_DETAIL_CACHE_PREFIX)
  invalidateCacheKey(HOME_STATS_CACHE_KEY)
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
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

function mapCompetitionWithEmbeddedParticipants(
  row: Record<string, unknown>,
): Competition {
  const mappedCompetition = mapCompetition(row)
  const participants = new Map<string, MemberMini>()

  const links = Array.isArray(row.competition_members)
    ? row.competition_members
    : []

  for (const item of links) {
    if (!isRecord(item)) {
      continue
    }

    const embeddedMembers = Array.isArray(item.members)
      ? item.members
      : item.members && isRecord(item.members)
        ? [item.members]
        : []

    for (const embeddedMember of embeddedMembers) {
      if (!isRecord(embeddedMember)) {
        continue
      }

      const member = mapMemberMini(embeddedMember)
      if (member.id && !participants.has(member.id)) {
        participants.set(member.id, member)
      }
    }
  }

  return {
    ...mappedCompetition,
    participants: [...participants.values()],
  }
}

function toEmbeddedRecords(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord)
  }

  return isRecord(value) ? [value] : []
}

function asMediaType(value: unknown): CompetitionMediaType {
  return value === 'certificate' || value === 'event_photo' ? value : 'event_photo'
}

function mapCompetitionMedia(row: Record<string, unknown>): CompetitionMedia {
  return {
    id: asString(row.id) ?? '',
    competitionId: asString(row.competition_id) ?? '',
    standingCompetitionId: asString(row.standing_competition_id),
    mediaType: asMediaType(row.media_type),
    fileName: asString(row.file_name) ?? '未命名文件',
    objectKey: asString(row.object_key) ?? '',
    mimeType: asString(row.mime_type),
    fileSize: asNumber(row.file_size),
    url: asString(row.url) ?? '',
    remark: asString(row.remark),
    createdAt: asString(row.created_at),
  }
}

function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const maybeCode =
    'code' in error
      ? (error as { code?: unknown }).code
      : null

  return maybeCode === '42P01'
}

function sortCompetitionDesc(a: Competition, b: Competition): number {
  const aTime = a.happenedAt ? Date.parse(a.happenedAt) : 0
  const bTime = b.happenedAt ? Date.parse(b.happenedAt) : 0

  if (aTime !== bTime) {
    return bTime - aTime
  }

  return b.seasonYear - a.seasonYear
}

function getRankValue(rank: string | null): number {
  if (!rank) {
    return Number.POSITIVE_INFINITY
  }

  const match = rank.match(/\d+/)
  if (!match) {
    return Number.POSITIVE_INFINITY
  }

  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY
}

function getAwardLevel(award: string | null): number {
  if (!award) {
    return 0
  }

  const text = award.toLowerCase()

  if (/冠军|特等|金|一等奖|first|champion|gold/.test(text)) {
    return 7
  }
  if (/亚军|银|二等奖|second|silver/.test(text)) {
    return 6
  }
  if (/季军|铜|三等奖|third|bronze/.test(text)) {
    return 5
  }
  if (/优秀|honorable/.test(text)) {
    return 3
  }

  return 1
}

function sortCompetitionStanding(a: Competition, b: Competition): number {
  const aRank = getRankValue(a.rank)
  const bRank = getRankValue(b.rank)

  if (aRank !== bRank) {
    return aRank - bRank
  }

  const aAward = getAwardLevel(a.award)
  const bAward = getAwardLevel(b.award)

  if (aAward !== bAward) {
    return bAward - aAward
  }

  if (a.teamName && b.teamName) {
    return a.teamName.localeCompare(b.teamName, 'zh-Hans-CN')
  }

  return a.title.localeCompare(b.title, 'zh-Hans-CN')
}

function hasStandingContent(item: Competition): boolean {
  return (
    Boolean(item.rank?.trim()) ||
    Boolean(item.award?.trim()) ||
    Boolean(item.teamName?.trim()) ||
    item.participants.length > 0
  )
}

function hasAwardContent(item: Competition): boolean {
  return Boolean(item.rank?.trim()) || Boolean(item.award?.trim())
}

async function enrichCompetitionsWithParticipants(
  client: ReturnType<typeof getSupabaseClient>,
  rows: Record<string, unknown>[],
): Promise<Competition[]> {
  if (rows.length === 0) {
    return []
  }

  const competitionIds = rows
    .map((row) => asString(row.id))
    .filter((id): id is string => Boolean(id))

  if (competitionIds.length === 0) {
    return rows.map((row) => mapCompetition(row))
  }

  const { data: links, error: linkError } = await client
    .from('competition_members')
    .select('competition_id,member_id')
    .in('competition_id', competitionIds)

  if (linkError) {
    throw linkError
  }

  const memberIds = [
    ...new Set(
      (links ?? [])
        .map((row) => asString((row as Record<string, unknown>).member_id))
        .filter((id): id is string => Boolean(id)),
    ),
  ]

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

  return rows.map((row) => {
    const mapped = mapCompetition(row)
    return {
      ...mapped,
      participants: participantsByCompetition.get(mapped.id) ?? [],
    }
  })
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

export function peekCompetitionDetail(competitionId: string) {
  return peekCachedValue<CompetitionDetail>(toCompetitionDetailCacheKey(competitionId))
}

export function peekCohortOverview() {
  return peekCachedValue<Competition[]>(COHORT_OVERVIEW_CACHE_KEY)
}

export function peekCompetitionTimeline() {
  return peekCachedValue<Competition[]>(COHORT_TIMELINE_CACHE_KEY)
}

export function peekAwardsOverview() {
  return peekCachedValue<Competition[]>(AWARDS_OVERVIEW_CACHE_KEY)
}

export function peekHomeStats() {
  return peekCachedValue<HomeStats>(HOME_STATS_CACHE_KEY)
}

export function warmPublicData() {
  return Promise.allSettled([
    fetchHomeStats(),
    fetchMembersPage({
      page: DEFAULT_MEMBERS_PAGE,
      pageSize: DEFAULT_MEMBERS_PAGE_SIZE,
      sortBy: DEFAULT_MEMBER_SORT_BY,
      sortDirection: DEFAULT_MEMBER_SORT_DIRECTION,
    }),
    fetchAvailableCohorts(),
    fetchCompetitionTimeline(),
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

      const { data: embeddedLinks, error: embeddedLinkError } = await client
        .from('competition_members')
        .select(`competition_id,competitions(${competitionFields})`)
        .eq('member_id', memberId)

      let competitions: Competition[] = []

      if (!embeddedLinkError) {
        const uniqueCompetitions = new Map<string, Competition>()
        const rows = (embeddedLinks as unknown as Record<string, unknown>[] | null) ?? []

        for (const row of rows) {
          const embeddedCompetitionRows = toEmbeddedRecords(row.competitions)
          for (const embeddedCompetitionRow of embeddedCompetitionRows) {
            const mappedCompetition = mapCompetition(embeddedCompetitionRow)
            if (mappedCompetition.id && !uniqueCompetitions.has(mappedCompetition.id)) {
              uniqueCompetitions.set(mappedCompetition.id, mappedCompetition)
            }
          }
        }

        competitions = [...uniqueCompetitions.values()].sort(sortCompetitionDesc)
      } else {
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
      }

      return {
        ...mapMember(memberRow as unknown as Record<string, unknown>),
        competitions,
      }
    },
  })
}

export async function fetchCompetitionDetail(
  competitionId: string,
): Promise<CompetitionDetail> {
  return fetchWithCache({
    key: toCompetitionDetailCacheKey(competitionId),
    ttlMs: COMPETITION_DETAIL_CACHE_TTL_MS,
    fetcher: async () => {
      const client = getSupabaseClient()

      const { data: focusRow, error: focusError } = await client
        .from('competitions')
        .select(competitionFields)
        .eq('id', competitionId)
        .single()

      if (focusError) {
        throw focusError
      }

      const focusRaw = focusRow as unknown as Record<string, unknown>
      const focus = mapCompetition(focusRaw)

      let standings: Competition[] = []

      const { data: relatedEmbeddedRows, error: relatedEmbeddedError } = await client
        .from('competitions')
        .select(competitionFieldsWithParticipants)
        .eq('title', focus.title)
        .eq('category', focus.category)
        .eq('season_year', focus.seasonYear)

      if (!relatedEmbeddedError) {
        const mappedWithParticipants = (
          (relatedEmbeddedRows as unknown as Record<string, unknown>[] | null) ??
          []
        ).map((row) => mapCompetitionWithEmbeddedParticipants(row))

        standings = (
          mappedWithParticipants.length > 0
            ? mappedWithParticipants
            : [focus]
        ).sort(sortCompetitionStanding)
      } else {
        const { data: relatedRows, error: relatedError } = await client
          .from('competitions')
          .select(competitionFields)
          .eq('title', focus.title)
          .eq('category', focus.category)
          .eq('season_year', focus.seasonYear)

        if (relatedError) {
          throw relatedError
        }

        const standingsRows = (
          (relatedRows as unknown as Record<string, unknown>[] | null) ?? []
        )
        const rowsWithFallback =
          standingsRows.length > 0
            ? standingsRows
            : [focusRaw]

        standings = (await enrichCompetitionsWithParticipants(
          client,
          rowsWithFallback,
        )).sort(sortCompetitionStanding)
      }

      const standingsOnly = standings.filter((item) => hasStandingContent(item))

      const relatedCompetitionIds = [
        ...new Set(
          standings
            .map((item) => item.id)
            .filter((id): id is string => Boolean(id)),
        ),
      ]

      let media: CompetitionMedia[] = []
      if (relatedCompetitionIds.length > 0) {
        const { data: mediaRows, error: mediaError } = await client
          .from('competition_media')
          .select(competitionMediaFields)
          .in('competition_id', relatedCompetitionIds)
          .order('created_at', { ascending: false })

        if (mediaError) {
          if (!isMissingRelationError(mediaError)) {
            throw mediaError
          }
        } else {
          media = (mediaRows ?? []).map((row) =>
            mapCompetitionMedia(row as unknown as Record<string, unknown>),
          )
        }
      }

      const focusWithParticipants =
        standings.find((item) => item.id === competitionId) ?? focus

      return {
        focus: focusWithParticipants,
        standings: standingsOnly,
        media,
      }
    },
  })
}

export async function fetchCompetitionTimeline() {
  return fetchWithCache({
    key: COHORT_TIMELINE_CACHE_KEY,
    ttlMs: COHORT_TIMELINE_CACHE_TTL_MS,
    fetcher: async () => {
      const client = getSupabaseClient()
      const { data: rows, error } = await client
        .from('competitions')
        .select(competitionFields)
        .order('happened_at', { ascending: false })
        .order('season_year', { ascending: false })

      if (error) {
        throw error
      }

      return ((rows as unknown as Record<string, unknown>[] | null) ?? [])
        .map((row) => mapCompetition(row))
        .sort(sortCompetitionDesc)
    },
  })
}

export async function fetchAwardsOverview() {
  return fetchWithCache({
    key: AWARDS_OVERVIEW_CACHE_KEY,
    ttlMs: AWARDS_OVERVIEW_CACHE_TTL_MS,
    fetcher: async () => {
      const client = getSupabaseClient()
      const { data: embeddedRows, error: embeddedError } = await client
        .from('competitions')
        .select(competitionFieldsWithParticipants)
        .or('award.not.is.null,rank.not.is.null')
        .order('happened_at', { ascending: false })
        .order('season_year', { ascending: false })

      if (!embeddedError) {
        return (
          (
            (embeddedRows as unknown as Record<string, unknown>[] | null) ??
            []
          )
            .map((row) => mapCompetitionWithEmbeddedParticipants(row))
            .filter(hasAwardContent)
            .sort(sortCompetitionDesc)
        )
      }

      const { data: rows, error } = await client
        .from('competitions')
        .select(competitionFields)
        .or('award.not.is.null,rank.not.is.null')
        .order('happened_at', { ascending: false })
        .order('season_year', { ascending: false })

      if (error) {
        throw error
      }

      const mapped = await enrichCompetitionsWithParticipants(
        client,
        ((rows as unknown as Record<string, unknown>[] | null) ?? []),
      )

      return mapped
        .filter(hasAwardContent)
        .sort(sortCompetitionDesc)
    },
  })
}

export async function fetchCohortOverview() {
  return fetchWithCache({
    key: COHORT_OVERVIEW_CACHE_KEY,
    ttlMs: COHORT_OVERVIEW_CACHE_TTL_MS,
    fetcher: async () => {
      const client = getSupabaseClient()
      const { data: embeddedRows, error: embeddedError } = await client
        .from('competitions')
        .select(competitionFieldsWithParticipants)
        .order('happened_at', { ascending: false })
        .order('season_year', { ascending: false })

      if (!embeddedError) {
        return (
          (
            (embeddedRows as unknown as Record<string, unknown>[] | null) ??
            []
          )
            .map((row) => mapCompetitionWithEmbeddedParticipants(row))
            .sort(sortCompetitionDesc)
        )
      }

      const { data: rows, error } = await client
        .from('competitions')
        .select(competitionFields)
        .order('happened_at', { ascending: false })
        .order('season_year', { ascending: false })

      if (error) {
        throw error
      }

      const mapped = await enrichCompetitionsWithParticipants(
        client,
        ((rows as unknown as Record<string, unknown>[] | null) ?? []),
      )

      return mapped.sort(sortCompetitionDesc)
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
            .limit(20),
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

type CreateCompetitionMediaInput = {
  competitionId: string
  mediaType: CompetitionMediaType
  fileName: string
  objectKey: string
  url: string
  mimeType?: string
  fileSize?: number
  remark?: string
  standingCompetitionId?: string
}

type UploadCompetitionMediaInput = {
  competitionId: string
  mediaType: CompetitionMediaType
  file: File
  standingCompetitionId?: string
  remark?: string
  onProgress?: (progress: UploadProgress) => void
}

export type UploadProgress = {
  loaded: number
  total: number | null
  percent: number
}

type SignedOssUploadResponse = {
  uploadUrl: string
  publicUrl: string
  objectKey: string
  fileName: string
  contentType: string
  expiresAt: string
}

function normalizeContentType(contentType: string | undefined) {
  const trimmed = contentType?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : 'application/octet-stream'
}

function normalizeFileName(rawName: string) {
  const trimmed = rawName.trim()
  if (trimmed.length === 0) {
    return 'upload.bin'
  }

  return trimmed.slice(-120)
}

function toSafeFileSize(size: number | undefined) {
  if (!Number.isFinite(size)) {
    return undefined
  }

  const rounded = Math.floor(size as number)
  return rounded >= 0 ? rounded : undefined
}

async function formatFunctionInvokeError(error: unknown) {
  const fallback =
    error instanceof Error ? error.message : '上传签名服务调用失败，请检查 Edge Function 日志'

  if (!error || typeof error !== 'object') {
    return fallback
  }

  const context = (error as { context?: unknown }).context
  if (!(context instanceof Response)) {
    return fallback
  }

  const statusText = context.statusText?.trim()
  const statusPart = statusText
    ? `上传签名服务返回 HTTP ${context.status} ${statusText}`
    : `上传签名服务返回 HTTP ${context.status}`

  let detail = ''
  try {
    const response = context.clone()
    const contentType = response.headers.get('content-type') || ''

    if (contentType.includes('application/json')) {
      const payload = await response.json()
      if (payload && typeof payload === 'object') {
        const payloadObject = payload as Record<string, unknown>
        if (typeof payloadObject.error === 'string' && payloadObject.error.trim().length > 0) {
          detail = payloadObject.error.trim()
        } else if (
          typeof payloadObject.message === 'string' &&
          payloadObject.message.trim().length > 0
        ) {
          detail = payloadObject.message.trim()
        } else {
          detail = JSON.stringify(payloadObject)
        }
      } else if (typeof payload === 'string') {
        detail = payload.trim()
      }
    } else {
      detail = (await response.text()).trim()
    }
  } catch {
    detail = ''
  }

  return detail.length > 0 ? `${statusPart}: ${detail}` : statusPart
}

function getFunctionErrorStatus(error: unknown) {
  if (!error || typeof error !== 'object') {
    return undefined
  }

  const context = (error as { context?: unknown }).context
  return context instanceof Response ? context.status : undefined
}

function isInvalidJwtFunctionError(error: unknown, message: string) {
  const normalizedMessage = message.toLowerCase()
  return getFunctionErrorStatus(error) === 401 || /invalid jwt/.test(normalizedMessage)
}

function putFileToSignedUrlWithProgress(options: {
  uploadUrl: string
  contentType: string
  file: File
  onProgress?: (progress: UploadProgress) => void
}) {
  // TODO: 增加上传失败自动重试与断点续传能力（需要后端分片签名/合并支持）。
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PUT', options.uploadUrl)
    request.setRequestHeader('Content-Type', options.contentType)

    if (options.onProgress) {
      request.upload.onprogress = (event) => {
        const total = event.lengthComputable ? event.total : null
        const percent =
          total && total > 0 ? Math.min(100, Math.round((event.loaded / total) * 100)) : 0

        options.onProgress?.({
          loaded: event.loaded,
          total,
          percent,
        })
      }
    }

    request.onerror = () => {
      reject(
        new Error(
          '上传到 OSS 失败：网络异常（请检查 OSS CORS、Endpoint 与当前网络连通性）。',
        ),
      )
    }

    request.onabort = () => {
      reject(new Error('上传到 OSS 已被取消。'))
    }

    request.onload = () => {
      const status = request.status
      if (status >= 200 && status < 300) {
        options.onProgress?.({
          loaded: options.file.size,
          total: options.file.size,
          percent: 100,
        })
        resolve()
        return
      }

      const detail = request.responseText?.trim()
      reject(
        new Error(
          detail
            ? `上传到 OSS 失败（HTTP ${status}）：${detail.slice(0, 200)}`
            : `上传到 OSS 失败（HTTP ${status}）`,
        ),
      )
    }

    request.send(options.file)
  })
}

export async function createCompetitionMedia(
  input: CreateCompetitionMediaInput,
): Promise<CompetitionMedia> {
  const client = getSupabaseClient()

  const payload = {
    competition_id: input.competitionId,
    standing_competition_id: input.standingCompetitionId ?? null,
    media_type: input.mediaType,
    file_name: normalizeFileName(input.fileName),
    object_key: input.objectKey.trim(),
    mime_type: normalizeContentType(input.mimeType),
    file_size: toSafeFileSize(input.fileSize) ?? null,
    url: input.url.trim(),
    remark: input.remark?.trim() || null,
  }

  const { data, error } = await client
    .from('competition_media')
    .insert(payload)
    .select(competitionMediaFields)
    .single()

  if (error) {
    if (isMissingRelationError(error)) {
      throw new Error('数据库缺少 competition_media 表，请先执行最新版 supabase/schema.sql')
    }
    throw error
  }

  invalidateCompetitionRelatedCache()
  return mapCompetitionMedia(data as unknown as Record<string, unknown>)
}

export async function uploadCompetitionMedia(
  input: UploadCompetitionMediaInput,
): Promise<CompetitionMedia> {
  if (!input.file) {
    throw new Error('请选择要上传的文件')
  }

  const client = getSupabaseClient()

  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser()
  if (userError) {
    throw userError
  }

  if (!user) {
    throw new Error('请先以管理员账号登录后再上传附件')
  }

  const normalizedFileName = normalizeFileName(input.file.name)
  const contentType = normalizeContentType(input.file.type)
  const fileSize = toSafeFileSize(input.file.size) ?? 0

  const invokeSignUpload = () =>
    client.functions.invoke<SignedOssUploadResponse>('oss-sign-upload', {
      body: {
        competitionId: input.competitionId,
        mediaType: input.mediaType,
        standingCompetitionId: input.standingCompetitionId ?? null,
        fileName: normalizedFileName,
        contentType,
        fileSize,
      },
    })

  let { data: signedData, error: signError } = await invokeSignUpload()

  if (signError) {
    const initialMessage = await formatFunctionInvokeError(signError)

    if (isInvalidJwtFunctionError(signError, initialMessage)) {
      const { data: refreshedSessionData, error: refreshError } = await client.auth.refreshSession()
      const refreshedToken = refreshedSessionData.session?.access_token

      if (!refreshError && refreshedToken) {
        const retried = await invokeSignUpload()
        signedData = retried.data
        signError = retried.error
      }
    }
  }

  if (signError) {
    const message = signError.message || ''
    if (/404|not found|Failed to send/i.test(message)) {
      throw new Error('未找到 oss-sign-upload 函数，请先在 Supabase 部署该函数')
    }

    const formattedMessage = await formatFunctionInvokeError(signError)
    if (isInvalidJwtFunctionError(signError, formattedMessage)) {
      try {
        await client.auth.signOut()
      } catch {
        // ignore
      }

      throw new Error('登录态已失效，请重新登录管理员账号后再上传')
    }

    throw new Error(formattedMessage)
  }

  if (!signedData?.uploadUrl || !signedData.publicUrl || !signedData.objectKey) {
    throw new Error('上传签名服务返回异常，请检查 oss-sign-upload 函数配置')
  }

  input.onProgress?.({
    loaded: 0,
    total: fileSize,
    percent: 0,
  })

  try {
    await putFileToSignedUrlWithProgress({
      uploadUrl: signedData.uploadUrl,
      contentType: signedData.contentType || contentType,
      file: input.file,
      onProgress: input.onProgress,
    })
  } catch (uploadError) {
    const reason = uploadError instanceof Error ? uploadError.message : 'unknown error'
    throw new Error(`上传到 OSS 失败：${reason}`)
  }

  return createCompetitionMedia({
    competitionId: input.competitionId,
    mediaType: input.mediaType,
    standingCompetitionId: input.standingCompetitionId,
    fileName: signedData.fileName || normalizedFileName,
    objectKey: signedData.objectKey,
    url: signedData.publicUrl,
    mimeType: signedData.contentType || contentType,
    fileSize,
    remark: input.remark,
  })
}

export async function deleteCompetitionMedia(mediaId: string) {
  const client = getSupabaseClient()
  const { error } = await client
    .from('competition_media')
    .delete()
    .eq('id', mediaId)

  if (error) {
    if (isMissingRelationError(error)) {
      throw new Error('数据库缺少 competition_media 表，请先执行最新版 supabase/schema.sql')
    }
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
