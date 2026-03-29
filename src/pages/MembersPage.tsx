import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import {
  fetchAvailableCohorts,
  fetchMembersPage,
  peekAvailableCohorts,
  peekMembersPage,
  type MemberPageQuery,
  type MemberSortField,
  type SortDirection,
} from '../lib/api'
import { downloadCsv } from '../lib/csv'
import { isSupabaseConfigured } from '../lib/supabase'
import type { Member } from '../types'

type StatusFilter = 'all' | 'active' | 'inactive'

const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 20
const DEFAULT_SORT_BY: MemberSortField = 'cohort_year'
const DEFAULT_SORT_DIRECTION: SortDirection = 'desc'

const PAGE_SIZE_OPTIONS = [10, 20, 50]

function parseCohort(raw: string | null): number | '' {
  if (!raw) {
    return ''
  }

  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : ''
}

function parseStatus(raw: string | null): StatusFilter {
  if (raw === 'active' || raw === 'inactive') {
    return raw
  }

  return 'all'
}

function parsePositiveInt(raw: string | null, fallback: number) {
  if (!raw) {
    return fallback
  }

  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    return fallback
  }

  const rounded = Math.floor(parsed)
  return rounded > 0 ? rounded : fallback
}

function parsePageSize(raw: string | null) {
  const parsed = parsePositiveInt(raw, DEFAULT_PAGE_SIZE)
  return PAGE_SIZE_OPTIONS.includes(parsed) ? parsed : DEFAULT_PAGE_SIZE
}

function parseSortBy(raw: string | null): MemberSortField {
  if (raw === 'name' || raw === 'created_at' || raw === 'cohort_year') {
    return raw
  }

  return DEFAULT_SORT_BY
}

function parseSortDirection(raw: string | null): SortDirection {
  if (raw === 'asc' || raw === 'desc') {
    return raw
  }

  return DEFAULT_SORT_DIRECTION
}

function toActiveFilter(statusFilter: StatusFilter): boolean | undefined {
  if (statusFilter === 'active') {
    return true
  }

  if (statusFilter === 'inactive') {
    return false
  }

  return undefined
}

function buildMembersPageQuery(input: {
  query: string
  cohortYear: number | ''
  statusFilter: StatusFilter
  page: number
  pageSize: number
  sortBy: MemberSortField
  sortDirection: SortDirection
}): MemberPageQuery {
  return {
    query: input.query,
    cohortYear: input.cohortYear === '' ? undefined : input.cohortYear,
    isActive: toActiveFilter(input.statusFilter),
    page: input.page,
    pageSize: input.pageSize,
    sortBy: input.sortBy,
    sortDirection: input.sortDirection,
  }
}

function getCurrentDateLabel() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

function exportMembersAsCsv(members: Member[]) {
  downloadCsv({
    filename: `gu-acmerdb-members-page-${getCurrentDateLabel()}.csv`,
    headers: ['姓名', '届别', 'handle', '专业', '状态'],
    rows: members.map((member) => [
      member.name,
      member.cohortYear,
      member.handle ?? '',
      member.major ?? '',
      member.isActive ? '在队' : '已毕业/离队',
    ]),
  })
}

export function MembersPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const initialQuery = searchParams.get('q') ?? ''
  const initialCohortYear = parseCohort(searchParams.get('cohort'))
  const initialStatusFilter = parseStatus(searchParams.get('status'))
  const initialPage = parsePositiveInt(searchParams.get('page'), DEFAULT_PAGE)
  const initialPageSize = parsePageSize(searchParams.get('pageSize'))
  const initialSortBy = parseSortBy(searchParams.get('sort'))
  const initialSortDirection = parseSortDirection(searchParams.get('order'))

  const initialMembersPageCache = peekMembersPage(
    buildMembersPageQuery({
      query: initialQuery,
      cohortYear: initialCohortYear,
      statusFilter: initialStatusFilter,
      page: initialPage,
      pageSize: initialPageSize,
      sortBy: initialSortBy,
      sortDirection: initialSortDirection,
    }),
  )

  const [members, setMembers] = useState<Member[]>(() => initialMembersPageCache?.items ?? [])
  const [total, setTotal] = useState(() => initialMembersPageCache?.total ?? 0)
  const [pageCount, setPageCount] = useState(() => initialMembersPageCache?.pageCount ?? 1)
  const [cohorts, setCohorts] = useState<number[]>(() => peekAvailableCohorts() ?? [])

  const [query, setQuery] = useState(initialQuery)
  const [cohortYear, setCohortYear] = useState<number | ''>(initialCohortYear)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatusFilter)
  const [page, setPage] = useState(initialPage)
  const [pageSize, setPageSize] = useState(initialPageSize)
  const [sortBy, setSortBy] = useState<MemberSortField>(initialSortBy)
  const [sortDirection, setSortDirection] = useState<SortDirection>(initialSortDirection)

  const [loading, setLoading] = useState(() => initialMembersPageCache === null)
  const [error, setError] = useState<string | null>(null)

  const debouncedQuery = useDebouncedValue(query, 300)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError('尚未配置 Supabase，请先填写 .env.local。')
      setLoading(false)
      return
    }

    let disposed = false

    async function loadCohorts() {
      const cached = peekAvailableCohorts()
      if (cached && !disposed) {
        setCohorts(cached)
      }

      try {
        const items = await fetchAvailableCohorts()
        if (!disposed) {
          setCohorts(items)
        }
      } catch {
        // keep page usable if auxiliary query fails
      }
    }

    void loadCohorts()

    return () => {
      disposed = true
    }
  }, [])

  useEffect(() => {
    const nextParams = new URLSearchParams()

    if (query.trim()) {
      nextParams.set('q', query.trim())
    }
    if (cohortYear !== '') {
      nextParams.set('cohort', String(cohortYear))
    }
    if (statusFilter !== 'all') {
      nextParams.set('status', statusFilter)
    }
    if (sortBy !== DEFAULT_SORT_BY) {
      nextParams.set('sort', sortBy)
    }
    if (sortDirection !== DEFAULT_SORT_DIRECTION) {
      nextParams.set('order', sortDirection)
    }
    if (page !== DEFAULT_PAGE) {
      nextParams.set('page', String(page))
    }
    if (pageSize !== DEFAULT_PAGE_SIZE) {
      nextParams.set('pageSize', String(pageSize))
    }

    setSearchParams(nextParams, { replace: true })
  }, [
    cohortYear,
    page,
    pageSize,
    query,
    setSearchParams,
    sortBy,
    sortDirection,
    statusFilter,
  ])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return
    }

    let disposed = false

    async function loadMembers() {
      const request = buildMembersPageQuery({
        query: debouncedQuery,
        cohortYear,
        statusFilter,
        page,
        pageSize,
        sortBy,
        sortDirection,
      })

      const cached = peekMembersPage(request)
      if (cached) {
        setMembers(cached.items)
        setTotal(cached.total)
        setPageCount(cached.pageCount)
        setLoading(false)
      } else {
        setLoading(true)
      }

      setError(null)

      try {
        const result = await fetchMembersPage(request)

        if (disposed) {
          return
        }

        if (result.pageCount > 0 && page > result.pageCount) {
          setPage(result.pageCount)
          return
        }

        setMembers(result.items)
        setTotal(result.total)
        setPageCount(result.pageCount)
      } catch (loadError) {
        if (!disposed) {
          setError(cached ? null : loadError instanceof Error ? loadError.message : '加载失败')
        }
      } finally {
        if (!disposed) {
          setLoading(false)
        }
      }
    }

    void loadMembers()

    return () => {
      disposed = true
    }
  }, [cohortYear, debouncedQuery, page, pageSize, sortBy, sortDirection, statusFilter])

  const hasActiveFilters =
    query.trim().length > 0 || cohortYear !== '' || statusFilter !== 'all'

  const pageSummary = useMemo(() => {
    if (total <= 0) {
      return '共 0 名队员'
    }

    const start = (page - 1) * pageSize + 1
    const end = Math.min(total, page * pageSize)
    return `第 ${start}-${end} 条 / 共 ${total} 名队员`
  }, [page, pageSize, total])

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-header">
          <h2>队员列表</h2>
          <p>支持关键词、届别、在队状态组合筛选（URL 会自动记住筛选条件）。</p>
        </div>

        <div className="filters">
          <label>
            关键词
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setPage(DEFAULT_PAGE)
              }}
              placeholder="姓名 / handle"
            />
          </label>

          <label>
            届别
            <select
              value={cohortYear}
              onChange={(event) => {
                const value = event.target.value
                setCohortYear(value ? Number(value) : '')
                setPage(DEFAULT_PAGE)
              }}
            >
              <option value="">全部届别</option>
              {cohorts.map((year) => (
                <option key={year} value={year}>
                  {year} 级
                </option>
              ))}
            </select>
          </label>

          <label>
            状态
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as StatusFilter)
                setPage(DEFAULT_PAGE)
              }}
            >
              <option value="all">全部状态</option>
              <option value="active">仅在队</option>
              <option value="inactive">仅已毕业/离队</option>
            </select>
          </label>

          <label>
            排序字段
            <select
              value={sortBy}
              onChange={(event) => {
                setSortBy(event.target.value as MemberSortField)
                setPage(DEFAULT_PAGE)
              }}
            >
              <option value="cohort_year">届别</option>
              <option value="name">姓名</option>
              <option value="created_at">录入时间</option>
            </select>
          </label>

          <label>
            排序方向
            <select
              value={sortDirection}
              onChange={(event) => {
                setSortDirection(event.target.value as SortDirection)
                setPage(DEFAULT_PAGE)
              }}
            >
              <option value="desc">降序</option>
              <option value="asc">升序</option>
            </select>
          </label>

          <label>
            每页数量
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value))
                setPage(DEFAULT_PAGE)
              }}
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option} 条/页
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="filters-toolbar">
          <button
            className="btn"
            type="button"
            disabled={!hasActiveFilters}
            onClick={() => {
              setQuery('')
              setCohortYear('')
              setStatusFilter('all')
              setPage(DEFAULT_PAGE)
            }}
          >
            清空筛选
          </button>
          <button
            className="btn"
            type="button"
            disabled={loading || Boolean(error) || members.length === 0}
            onClick={() => exportMembersAsCsv(members)}
          >
            导出当前页 CSV
          </button>
          {!loading && !error ? <span className="status-hint">{pageSummary}</span> : null}
        </div>

        {loading ? <p className="status">正在加载队员数据...</p> : null}
        {error ? <p className="status status-error">{error}</p> : null}

        {!loading && !error ? (
          members.length === 0 ? (
            <EmptyState title="没有匹配队员" description="可调整筛选条件后重试。" />
          ) : (
            <>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>姓名</th>
                      <th>届别</th>
                      <th>handle</th>
                      <th>专业</th>
                      <th>状态</th>
                      <th>详情</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member) => (
                      <tr key={member.id}>
                        <td>{member.name}</td>
                        <td>{member.cohortYear} 级</td>
                        <td>{member.handle ?? '-'}</td>
                        <td>{member.major ?? '-'}</td>
                        <td>{member.isActive ? '在队' : '已毕业/离队'}</td>
                        <td>
                          <Link className="inline-link" to={`/member/${member.id}`}>
                            查看
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pagination-row">
                <button
                  className="btn"
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  上一页
                </button>
                <span className="status-hint">
                  第 {page} / {Math.max(1, pageCount)} 页
                </span>
                <button
                  className="btn"
                  type="button"
                  disabled={page >= pageCount}
                  onClick={() =>
                    setPage((current) => Math.min(Math.max(1, pageCount), current + 1))
                  }
                >
                  下一页
                </button>
              </div>
            </>
          )
        ) : null}

        <p className="todo-note">
          TODO: 后续增加“导出全部筛选结果（跨页）+ 高级检索条件保存 + 批量操作”能力。
        </p>
      </section>
    </div>
  )
}
