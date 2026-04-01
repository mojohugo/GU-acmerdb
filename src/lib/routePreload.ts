import type { ComponentType } from 'react'
import type { MemberSortField, SortDirection } from './api'

type PageModule = {
  default: ComponentType
}

type NetworkInformationLike = {
  saveData?: boolean
  effectiveType?: string
}

type NavigatorWithConnection = Navigator & {
  connection?: NetworkInformationLike
}

const preloadedTasks = new Set<string>()

const DEFAULT_MEMBERS_PAGE_QUERY: {
  page: number
  pageSize: number
  sortBy: MemberSortField
  sortDirection: SortDirection
} = {
  page: 1,
  pageSize: 20,
  sortBy: 'cohort_year',
  sortDirection: 'desc',
}

function shouldPrefetch() {
  if (typeof navigator === 'undefined') {
    return true
  }

  const connection = (navigator as NavigatorWithConnection).connection
  if (!connection) {
    return true
  }

  if (connection.saveData) {
    return false
  }

  return connection.effectiveType !== '2g' && connection.effectiveType !== 'slow-2g'
}

function normalizePath(path: string) {
  const cleaned = path.trim()
  const hashStripped = cleaned.startsWith('#') ? cleaned.slice(1) : cleaned
  const [pathname] = hashStripped.split(/[?#]/)

  if (!pathname || pathname.length === 0) {
    return '/'
  }

  return pathname.startsWith('/') ? pathname : `/${pathname}`
}

function getPathParam(path: string) {
  const segments = path.split('/').filter(Boolean)
  return segments.length >= 2 ? segments[1] : ''
}

function runPrefetchTask(key: string, task: () => Promise<unknown>) {
  if (!shouldPrefetch() || preloadedTasks.has(key)) {
    return
  }

  preloadedTasks.add(key)
  void task().catch(() => {
    // ignore prefetch failures and allow later retries
    preloadedTasks.delete(key)
  })
}

async function prefetchMembersData() {
  const api = await import('./api')
  await Promise.allSettled([
    api.fetchMembersPage(DEFAULT_MEMBERS_PAGE_QUERY),
    api.fetchAvailableCohorts(),
  ])
}

async function prefetchCohortsData() {
  const api = await import('./api')
  await api.fetchCompetitionTimeline()
}

async function prefetchAwardsData() {
  const api = await import('./api')
  await api.fetchAwardsOverview()
}

async function prefetchHomeData() {
  const api = await import('./api')
  await api.fetchHomeStats()
}

export const loadHomePage = async (): Promise<PageModule> => {
  const module = await import('../pages/HomePage')
  return { default: module.HomePage }
}

export const loadMembersPage = async (): Promise<PageModule> => {
  const module = await import('../pages/MembersPage')
  return { default: module.MembersPage }
}

export const loadMemberDetailPage = async (): Promise<PageModule> => {
  const module = await import('../pages/MemberDetailPage')
  return { default: module.MemberDetailPage }
}

export const loadCohortsPage = async (): Promise<PageModule> => {
  const module = await import('../pages/CohortsPage')
  return { default: module.CohortsPage }
}

export const loadAwardsPage = async (): Promise<PageModule> => {
  const module = await import('../pages/AwardsPage')
  return { default: module.AwardsPage }
}

export const loadCompetitionDetailPage = async (): Promise<PageModule> => {
  const module = await import('../pages/CompetitionDetailPage')
  return { default: module.CompetitionDetailPage }
}

export const loadAdminPage = async (): Promise<PageModule> => {
  const module = await import('../pages/AdminPage')
  return { default: module.AdminPage }
}

export const loadAboutPage = async (): Promise<PageModule> => {
  const module = await import('../pages/AboutPage')
  return { default: module.AboutPage }
}

export const loadNotFoundPage = async (): Promise<PageModule> => {
  const module = await import('../pages/NotFoundPage')
  return { default: module.NotFoundPage }
}

function prefetchHomeRoute() {
  runPrefetchTask('route:home', async () => {
    await Promise.allSettled([loadHomePage(), prefetchHomeData()])
  })
}

function prefetchMembersRoute() {
  runPrefetchTask('route:members', async () => {
    await Promise.allSettled([loadMembersPage(), prefetchMembersData()])
  })
}

function prefetchCohortsRoute() {
  runPrefetchTask('route:cohorts', async () => {
    await Promise.allSettled([loadCohortsPage(), prefetchCohortsData()])
  })
}

function prefetchAwardsRoute() {
  runPrefetchTask('route:awards', async () => {
    await Promise.allSettled([loadAwardsPage(), prefetchAwardsData()])
  })
}

function prefetchAdminRoute() {
  runPrefetchTask('route:admin', async () => {
    await loadAdminPage()
  })
}

function prefetchAboutRoute() {
  runPrefetchTask('route:about', async () => {
    await loadAboutPage()
  })
}

export function preloadMemberDetail(memberId: string) {
  const normalizedId = memberId.trim()
  if (!normalizedId) {
    return
  }

  runPrefetchTask(`route:member-detail:${normalizedId}`, async () => {
    const apiPromise = import('./api')
    await Promise.allSettled([loadMemberDetailPage(), apiPromise.then((api) => api.fetchMemberDetail(normalizedId))])
  })
}

export function preloadCompetitionDetail(competitionId: string) {
  const normalizedId = competitionId.trim()
  if (!normalizedId) {
    return
  }

  runPrefetchTask(`route:competition-detail:${normalizedId}`, async () => {
    const apiPromise = import('./api')
    await Promise.allSettled([
      loadCompetitionDetailPage(),
      apiPromise.then((api) => api.fetchCompetitionDetail(normalizedId)),
    ])
  })
}

export function preloadRouteForNavigation(path: string) {
  const normalized = normalizePath(path)

  if (normalized === '/' || normalized === '/home') {
    prefetchHomeRoute()
    return
  }

  if (normalized.startsWith('/members')) {
    prefetchMembersRoute()
    return
  }

  if (normalized.startsWith('/member/')) {
    preloadMemberDetail(getPathParam(normalized))
    return
  }

  if (normalized.startsWith('/cohorts')) {
    prefetchCohortsRoute()
    return
  }

  if (normalized.startsWith('/awards')) {
    prefetchAwardsRoute()
    return
  }

  if (normalized.startsWith('/competition/')) {
    preloadCompetitionDetail(getPathParam(normalized))
    return
  }

  if (normalized.startsWith('/admin')) {
    prefetchAdminRoute()
    return
  }

  if (normalized.startsWith('/about')) {
    prefetchAboutRoute()
  }
}

export function preloadCriticalRoutes() {
  prefetchHomeRoute()
  prefetchMembersRoute()
  prefetchCohortsRoute()
  prefetchAwardsRoute()
}
