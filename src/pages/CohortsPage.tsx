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

function cohortKey(competition: Competition): number {
  return competition.cohortYear ?? 0
}

function groupByCohort(competitions: Competition[]) {
  const map = new Map<number, Competition[]>()

  for (const competition of competitions) {
    const key = cohortKey(competition)
    if (!map.has(key)) {
      map.set(key, [])
    }
    map.get(key)?.push(competition)
  }

  return [...map.entries()].sort(([a], [b]) => b - a)
}

function groupByType(items: Competition[]) {
  const grouped: Record<ContestCategory, Competition[]> = {
    freshman: [],
    school: [],
    icpc_regional: [],
    ccpc_regional: [],
    provincial: [],
    lanqiao: [],
    ladder: [],
    other: [],
  }

  for (const item of items) {
    grouped[item.category].push(item)
  }

  return grouped
}

function toSearchText(competition: Competition) {
  return [
    competition.title,
    competition.teamName ?? '',
    competition.award ?? '',
    competition.rank ?? '',
    competition.remark ?? '',
    ...competition.participants.map((member) => member.name),
  ]
    .join(' ')
    .toLowerCase()
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
    filename: `gu-acmerdb-cohorts-${getCurrentDateLabel()}.csv`,
    headers: [
      '届别',
      '分类',
      '赛事',
      '赛季',
      '日期',
      '奖项',
      '名次',
      '队伍',
      '参赛成员',
      '备注',
    ],
    rows: competitions.map((competition) => [
      competition.cohortYear ?? '',
      CONTEST_TYPE_LABELS[competition.category],
      competition.title,
      competition.seasonYear,
      competition.happenedAt ?? '',
      competition.award ?? '',
      competition.rank ?? '',
      competition.teamName ?? '',
      competition.participants.map((member) => member.name).join('、'),
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

  const filteredCompetitions = useMemo(() => {
    const normalizedKeyword = debouncedKeyword.trim().toLowerCase()

    return competitions.filter((competition) => {
      if (categoryFilter !== 'all' && competition.category !== categoryFilter) {
        return false
      }

      if (!normalizedKeyword) {
        return true
      }

      return toSearchText(competition).includes(normalizedKeyword)
    })
  }, [categoryFilter, competitions, debouncedKeyword])

  const sections = useMemo(
    () => groupByCohort(filteredCompetitions),
    [filteredCompetitions],
  )

  const hasFilters = categoryFilter !== 'all' || keyword.trim().length > 0

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-header">
          <h2>按届别查看赛事</h2>
          <p>支持按赛事分类 + 关键词（赛事名、队伍、奖项、成员）快速筛选。</p>
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
              placeholder="赛事名 / 队伍 / 奖项 / 成员"
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
            disabled={loading || Boolean(error) || filteredCompetitions.length === 0}
            onClick={() => exportCompetitionsAsCsv(filteredCompetitions)}
          >
            导出当前结果 CSV
          </button>
          {!loading && !error ? (
            <span className="status-hint">
              共 {filteredCompetitions.length} 条记录，覆盖 {sections.length} 个届别
            </span>
          ) : null}
        </div>

        {loading ? <p className="status">正在加载届别赛事...</p> : null}
        {error ? <p className="status status-error">{error}</p> : null}

        {!loading && !error ? (
          sections.length === 0 ? (
            <EmptyState title="暂无匹配赛事数据" description="可尝试清空筛选后重试。" />
          ) : (
            <div className="stack">
              {sections.map(([year, items]) => {
                const grouped = groupByType(items)
                return (
                  <article key={year} className="cohort-block">
                    <h3>{year > 0 ? `${year} 级` : '未标注届别'}</h3>
                    {CONTEST_TYPE_ORDER.map((category) => {
                      const list = grouped[category]

                      if (list.length === 0) {
                        return null
                      }

                      return (
                        <section key={category} className="sub-panel">
                          <h4>{CONTEST_TYPE_LABELS[category]}</h4>
                          <div className="timeline">
                            {list.map((competition) => (
                              <article key={competition.id} className="timeline-item">
                                <div className="timeline-head">
                                  <Link
                                    className="inline-link"
                                    to={`/competition/${competition.id}`}
                                  >
                                    <strong>{competition.title}</strong>
                                  </Link>
                                  <ContestTypeTag category={competition.category} />
                                </div>
                                <p>
                                  {competition.happenedAt ?? '-'} · {competition.seasonYear}
                                  赛季
                                </p>
                                <p>
                                  奖项: {competition.award ?? '-'}
                                  {competition.rank ? ` · 名次: ${competition.rank}` : ''}
                                  {competition.teamName
                                    ? ` · 队伍: ${competition.teamName}`
                                    : ''}
                                </p>
                                <p>
                                  参赛成员:
                                  {competition.participants.length > 0
                                    ? ` ${competition.participants.map((member) => member.name).join('、')}`
                                    : ' 暂无关联'}
                                </p>
                                {competition.remark ? <p>备注: {competition.remark}</p> : null}
                              </article>
                            ))}
                          </div>
                        </section>
                      )
                    })}
                  </article>
                )
              })}
            </div>
          )
        ) : null}

        <p className="todo-note">
          TODO: 后续补充“时间轴图形化视图 + 届别对比图（支持跨届别指标）”。
        </p>
      </section>
    </div>
  )
}
