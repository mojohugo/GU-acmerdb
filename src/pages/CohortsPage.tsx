import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ContestTypeTag } from '../components/ContestTypeTag'
import { EmptyState } from '../components/EmptyState'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { fetchCohortOverview, peekCohortOverview } from '../lib/api'
import { CONTEST_TYPE_LABELS, CONTEST_TYPE_ORDER } from '../lib/constants'
import { downloadCsv } from '../lib/csv'
import { isSupabaseConfigured } from '../lib/supabase'
import type { Competition, ContestCategory } from '../types'

type CategoryFilter = ContestCategory | 'all'

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
  const cachedCompetitions = peekCohortOverview()
  const [competitions, setCompetitions] = useState<Competition[]>(
    () => cachedCompetitions ?? [],
  )
  const [loading, setLoading] = useState(() => !cachedCompetitions)
  const [error, setError] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [keyword, setKeyword] = useState('')

  const debouncedKeyword = useDebouncedValue(keyword, 250)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError('尚未配置 Supabase，请先填写 .env.local。')
      setLoading(false)
      return
    }

    let disposed = false

    async function load() {
      const cached = peekCohortOverview()
      if (cached) {
        setCompetitions(cached)
        setLoading(false)
      } else {
        setLoading(true)
      }
      setError(null)

      try {
        const result = await fetchCohortOverview()
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

  const sortedCompetitions = useMemo(() => {
    const normalizedKeyword = debouncedKeyword.trim().toLowerCase()

    const filtered = competitions.filter((competition) => {
        if (categoryFilter !== 'all' && competition.category !== categoryFilter) {
          return false
        }

        if (!normalizedKeyword) {
          return true
        }

        return toSearchText(competition).includes(normalizedKeyword)
      })

    const groupMap = new Map<string, Competition>()
    for (const item of filtered) {
      const groupKey = toCompetitionGroupKey(item)
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, item)
      }
    }

    return [...groupMap.values()].toSorted(sortByTimeDesc)
  }, [categoryFilter, competitions, debouncedKeyword])

  const hasFilters = categoryFilter !== 'all' || keyword.trim().length > 0

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
            <select
              value={categoryFilter}
              onChange={(event) =>
                setCategoryFilter(event.target.value as CategoryFilter)
              }
            >
              <option value="all">全部分类</option>
              {CONTEST_TYPE_ORDER.map((category) => (
                <option key={category} value={category}>
                  {CONTEST_TYPE_LABELS[category]}
                </option>
              ))}
            </select>
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
        </div>

        {loading ? <p className="status">正在加载赛事时间线...</p> : null}
        {error ? <p className="status status-error">{error}</p> : null}

        {!loading && !error ? (
          sortedCompetitions.length === 0 ? (
            <EmptyState title="暂无匹配赛事数据" description="可尝试清空筛选后重试。" />
          ) : (
            <div className="timeline">
              {sortedCompetitions.map((competition) => (
                <article key={competition.id} className="timeline-item">
                  <div className="timeline-head">
                    <Link className="inline-link" to={`/competition/${competition.id}`}>
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

        <p className="todo-note">
          TODO: 后续补充“时间轴图形化视图 + 月度/年度统计图 + 一键导出报告”。
        </p>
      </section>
    </div>
  )
}
