import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import {
  fetchAvailableCohorts,
  fetchMembers,
  type MemberFilters,
  peekAvailableCohorts,
  peekMembers,
} from '../lib/api'
import { downloadCsv } from '../lib/csv'
import { isSupabaseConfigured } from '../lib/supabase'
import type { Member } from '../types'

type StatusFilter = 'all' | 'active' | 'inactive'

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

function toActiveFilter(statusFilter: StatusFilter): boolean | undefined {
  if (statusFilter === 'active') {
    return true
  }

  if (statusFilter === 'inactive') {
    return false
  }

  return undefined
}

function buildMemberFilters(input: {
  query: string
  cohortYear: number | ''
  statusFilter: StatusFilter
}): MemberFilters {
  return {
    query: input.query,
    cohortYear: input.cohortYear === '' ? undefined : input.cohortYear,
    isActive: toActiveFilter(input.statusFilter),
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
    filename: `gu-acmerdb-members-${getCurrentDateLabel()}.csv`,
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
  const initialMembersCache = peekMembers(
    buildMemberFilters({
      query: initialQuery,
      cohortYear: initialCohortYear,
      statusFilter: initialStatusFilter,
    }),
  )
  const initialMembers = initialMembersCache ?? []

  const [members, setMembers] = useState<Member[]>(() => initialMembers)
  const [cohorts, setCohorts] = useState<number[]>(() => peekAvailableCohorts() ?? [])
  const [query, setQuery] = useState(initialQuery)
  const [cohortYear, setCohortYear] = useState<number | ''>(initialCohortYear)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatusFilter)
  const [loading, setLoading] = useState(() => initialMembersCache === null)
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
    setSearchParams(nextParams, { replace: true })
  }, [query, cohortYear, statusFilter, setSearchParams])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return
    }

    let disposed = false

    async function loadMembers() {
      const filters = buildMemberFilters({
        query: debouncedQuery,
        cohortYear,
        statusFilter,
      })
      const cached = peekMembers(filters)
      if (cached) {
        setMembers(cached)
        setLoading(false)
      } else {
        setLoading(true)
      }
      setError(null)

      try {
        const result = await fetchMembers(filters)

        if (!disposed) {
          setMembers(result)
        }
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
  }, [debouncedQuery, cohortYear, statusFilter])

  const isFiltering =
    query.trim().length > 0 || cohortYear !== '' || statusFilter !== 'all'

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
              onChange={(event) => setQuery(event.target.value)}
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
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            >
              <option value="all">全部状态</option>
              <option value="active">仅在队</option>
              <option value="inactive">仅已毕业/离队</option>
            </select>
          </label>
        </div>

        <div className="filters-toolbar">
          <button
            className="btn"
            type="button"
            disabled={!isFiltering}
            onClick={() => {
              setQuery('')
              setCohortYear('')
              setStatusFilter('all')
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
            导出当前结果 CSV
          </button>
          {!loading && !error ? (
            <span className="status-hint">共 {members.length} 名队员</span>
          ) : null}
        </div>

        {loading ? <p className="status">正在加载队员数据...</p> : null}
        {error ? <p className="status status-error">{error}</p> : null}

        {!loading && !error ? (
          members.length === 0 ? (
            <EmptyState title="没有匹配队员" description="可调整筛选条件后重试。" />
          ) : (
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
          )
        ) : null}

        <p className="todo-note">
          TODO: 后续增加“服务端分页 + 多字段排序 + 大数据量异步导出”能力，避免规模变大后单页加载过重。
        </p>
      </section>
    </div>
  )
}
