import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatedSelect } from '../components/AnimatedSelect'
import { ContestTypeTag } from '../components/ContestTypeTag'
import { EmptyState } from '../components/EmptyState'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { fetchCompetitionTimeline, peekCompetitionTimeline } from '../lib/api'
import { CONTEST_TYPE_LABELS, CONTEST_TYPE_ORDER } from '../lib/constants'
import { downloadCsv } from '../lib/csv'
import { preloadCompetitionDetail } from '../lib/routePreload'
import { isSupabaseConfigured } from '../lib/supabase'
import type { Competition, ContestCategory } from '../types'

type CategoryFilter = ContestCategory | 'all'
const PAGE_SIZE_OPTIONS = [10, 20, 50] as const

type IndexedTimelineCompetition = {
  competition: Competition
  searchText: string
}

function toSearchText(competition: Competition) {
  return [
    competition.title,
    competition.contestLevel ?? '',
    competition.teamName ?? '',
    competition.remark ?? '',
  ]
    .join(' ')
    .toLowerCase()
}

function toCompetitionGroupKey(competition: Competition) {
  return [
    competition.title,
    competition.category,
    String(competition.seasonYear),
    competition.happenedAt ?? '',
    competition.contestLevel ?? '',
  ].join('|')
}

function toCompetitionTime(competition: Competition) {
  const fromDate = competition.happenedAt ? Date.parse(competition.happenedAt) : NaN
  if (Number.isFinite(fromDate)) {
    return fromDate
  }

  return Date.parse(`${competition.seasonYear}-01-01`)
}

function sortByTimeDesc(a: Competition, b: Competition) {
  const aTime = toCompetitionTime(a)
  const bTime = toCompetitionTime(b)

  if (aTime !== bTime) {
    return bTime - aTime
  }

  return b.id.localeCompare(a.id)
}

function getCurrentDateLabel() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

function exportCompetitionsAsCsv(competitions: Competition[]) {
  downloadCsv({
    filename: `gu-acmerdb-competitions-${getCurrentDateLabel()}.csv`,
    headers: [
      '时间',
      '分类',
      '赛事',
      '比赛级别',
      '备注',
    ],
    rows: competitions.map((competition) => [
      competition.happenedAt ?? '',
      CONTEST_TYPE_LABELS[competition.category],
      competition.title,
      competition.contestLevel ?? '',
      competition.remark ?? '',
    ]),
  })
}

export function CohortsPage() {
  const cachedCompetitions = peekCompetitionTimeline()
  const [competitions, setCompetitions] = useState<Competition[]>(
    () => cachedCompetitions ?? [],
  )
  const [loading, setLoading] = useState(() => !cachedCompetitions)
  const [error, setError] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[1])

  const debouncedKeyword = useDebouncedValue(keyword, 250)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError('尚未配置 Supabase，请先填写 .env.local。')
      setLoading(false)
      return
    }

    let disposed = false

    async function load() {
      const cached = peekCompetitionTimeline()
      if (cached) {
        setCompetitions(cached)
        setLoading(false)
      } else {
        setLoading(true)
      }
      setError(null)

      try {
        const result = await fetchCompetitionTimeline()
        if (!disposed) {
          setCompetitions(result)
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

    void load()

    return () => {
      disposed = true
    }
  }, [])

  const indexedCompetitions = useMemo<IndexedTimelineCompetition[]>(() => {
    const groupMap = new Map<string, IndexedTimelineCompetition>()

    for (const competition of competitions) {
      const groupKey = toCompetitionGroupKey(competition)
      const current = groupMap.get(groupKey)
      if (!current) {
        groupMap.set(groupKey, {
          competition,
          searchText: toSearchText(competition),
        })
      } else {
        current.searchText = `${current.searchText} ${toSearchText(competition)}`
      }
    }

    return [...groupMap.values()].toSorted((a, b) =>
      sortByTimeDesc(a.competition, b.competition),
    )
  }, [competitions])

  const sortedCompetitions = useMemo(() => {
    const normalizedKeyword = debouncedKeyword.trim().toLowerCase()

    return indexedCompetitions
      .filter((item) => {
        if (categoryFilter !== 'all' && item.competition.category !== categoryFilter) {
          return false
        }

        if (!normalizedKeyword) {
          return true
        }

        return item.searchText.includes(normalizedKeyword)
      })
      .map((item) => item.competition)
  }, [categoryFilter, debouncedKeyword, indexedCompetitions])

  const pageCount = useMemo(
    () => (sortedCompetitions.length > 0 ? Math.ceil(sortedCompetitions.length / pageSize) : 1),
    [pageSize, sortedCompetitions.length],
  )

  const pagedCompetitions = useMemo(() => {
    const start = (page - 1) * pageSize
    return sortedCompetitions.slice(start, start + pageSize)
  }, [page, pageSize, sortedCompetitions])

  useEffect(() => {
    setPage(1)
  }, [categoryFilter, debouncedKeyword, pageSize])

  useEffect(() => {
    setPage((previous) => Math.min(Math.max(previous, 1), pageCount))
  }, [pageCount])

  const hasFilters = categoryFilter !== 'all' || keyword.trim().length > 0

  useEffect(() => {
    if (loading || error || pagedCompetitions.length === 0) {
      return
    }

    let timer: number | null = null
    let idleHandle: number | null = null

    const runPrefetch = () => {
      pagedCompetitions
        .slice(0, 6)
        .forEach((competition) => preloadCompetitionDetail(competition.id))
    }

    if (typeof window.requestIdleCallback === 'function') {
      idleHandle = window.requestIdleCallback(runPrefetch, { timeout: 1000 })
    } else {
      timer = window.setTimeout(runPrefetch, 180)
    }

    return () => {
      if (timer !== null) {
        window.clearTimeout(timer)
      }
      if (idleHandle !== null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleHandle)
      }
    }
  }, [error, loading, pagedCompetitions])

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-header">
          <h2>赛事时间线</h2>
          <p>统一按时间倒序展示，点击比赛进入详情页查看队伍和获奖信息。</p>
        </div>

        <div className="filters">
          <label>
            分类
            <AnimatedSelect
              value={categoryFilter}
              onChange={(value) => setCategoryFilter(value as CategoryFilter)}
              options={[
                { value: 'all', label: '全部分类' },
                ...CONTEST_TYPE_ORDER.map((category) => ({
                  value: category,
                  label: CONTEST_TYPE_LABELS[category],
                })),
              ]}
            />
          </label>

          <label>
            关键词
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="赛事名 / 比赛级别 / 备注"
            />
          </label>
        </div>

        <div className="filters-toolbar">
          <button
            className="btn"
            type="button"
            disabled={!hasFilters}
            onClick={() => {
              setCategoryFilter('all')
              setKeyword('')
            }}
          >
            清空筛选
          </button>
          <button
            className="btn"
            type="button"
            disabled={loading || Boolean(error) || sortedCompetitions.length === 0}
            onClick={() => exportCompetitionsAsCsv(sortedCompetitions)}
          >
            导出当前结果 CSV
          </button>
          {!loading && !error ? (
            <span className="status-hint">共 {sortedCompetitions.length} 条记录</span>
          ) : null}
          <label>
            每页数量
            <AnimatedSelect
              value={pageSize}
              onChange={(value) => setPageSize(Number(value))}
              disabled={loading || Boolean(error)}
              options={PAGE_SIZE_OPTIONS.map((option) => ({
                value: option,
                label: `${option} 条/页`,
              }))}
            />
          </label>
        </div>

        {loading ? <p className="status">正在加载赛事时间线...</p> : null}
        {error ? <p className="status status-error">{error}</p> : null}

        {!loading && !error ? (
          sortedCompetitions.length === 0 ? (
            <EmptyState title="暂无匹配赛事数据" description="可尝试清空筛选后重试。" />
          ) : (
            <div className="timeline">
              {pagedCompetitions.map((competition) => (
                <article key={competition.id} className="timeline-item">
                  <div className="timeline-head">
                    <Link
                      className="inline-link"
                      to={`/competition/${competition.id}`}
                      onMouseEnter={() => preloadCompetitionDetail(competition.id)}
                      onFocus={() => preloadCompetitionDetail(competition.id)}
                      onTouchStart={() => preloadCompetitionDetail(competition.id)}
                    >
                      <strong>{competition.title}</strong>
                    </Link>
                    <ContestTypeTag category={competition.category} />
                  </div>
                  <p>
                    时间: {competition.happenedAt ?? '-'}
                    {competition.contestLevel ? ` · ${competition.contestLevel}` : ''}
                  </p>
                  {competition.remark ? <p>备注: {competition.remark}</p> : null}
                </article>
              ))}
            </div>
          )
        ) : null}

        {!loading && !error && sortedCompetitions.length > 0 ? (
          <div className="pagination-row">
            <button
              className="btn"
              type="button"
              onClick={() => setPage((previous) => Math.max(1, previous - 1))}
              disabled={page <= 1}
            >
              上一页
            </button>
            <span className="status-hint">
              第 {page} / {pageCount} 页（本页 {pagedCompetitions.length} 条）
            </span>
            <button
              className="btn"
              type="button"
              onClick={() => setPage((previous) => Math.min(pageCount, previous + 1))}
              disabled={page >= pageCount}
            >
              下一页
            </button>
          </div>
        ) : null}

        <p className="todo-note">
          TODO: 后续补充“时间轴图形化视图 + 月度/年度统计图 + 一键导出报告”。
        </p>
      </section>
    </div>
  )
}
