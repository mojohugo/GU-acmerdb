import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ContestTypeTag } from '../components/ContestTypeTag'
import { EmptyState } from '../components/EmptyState'
import { fetchAwardsOverview, peekAwardsOverview } from '../lib/api'
import { CONTEST_TYPE_LABELS, CONTEST_TYPE_ORDER } from '../lib/constants'
import { downloadCsv } from '../lib/csv'
import { preloadCompetitionDetail, preloadMemberDetail } from '../lib/routePreload'
import { isSupabaseConfigured } from '../lib/supabase'
import type { Competition, ContestCategory } from '../types'

type CategoryFilter = ContestCategory | 'all'
type AwardTone = 'gold' | 'silver' | 'bronze' | 'excellent' | 'other'
type AwardTierFilter = AwardTone | 'all'
const PAGE_SIZE_OPTIONS = [10, 20, 50] as const
const TONE_ORDER: AwardTone[] = ['gold', 'silver', 'bronze', 'excellent', 'other']

type AwardRecord = {
  id: string
  title: string
  category: ContestCategory
  happenedAt: string | null
  contestLevel: string | null
  rank: string | null
  award: string | null
  teamName: string | null
  memberNames: string[]
  memberIds: string[]
  awardTone: AwardTone
}

type IndexedAwardRecord = AwardRecord & {
  searchText: string
  happenedAtTime: number
}

type StatsSummary = {
  totalRecords: number
  uniqueCompetitions: number
  uniqueMembers: number
  toneCounts: Record<AwardTone, number>
  categoryCounts: Array<{ category: ContestCategory; count: number }>
  memberTop: Array<{ memberId: string; memberName: string; count: number }>
}

const TONE_LABELS: Record<AwardTone, string> = {
  gold: '金奖/冠军',
  silver: '银奖/亚军',
  bronze: '铜奖/季军',
  excellent: '优秀/入围',
  other: '其他',
}

function toScalePercent(value: number, max: number) {
  if (max <= 0) {
    return 0
  }

  return Math.min(100, Math.max(8, Math.round((value / max) * 100)))
}

function hasAwardRecord(item: Competition) {
  return Boolean(item.rank?.trim()) || Boolean(item.award?.trim())
}

function resolveAwardTone(item: Competition): AwardTone {
  const normalized = `${item.award ?? ''} ${item.rank ?? ''}`.trim().toLowerCase()

  if (/冠军|特等|金|一等奖|first|champion|gold/.test(normalized)) {
    return 'gold'
  }
  if (/亚军|银|二等奖|second|silver/.test(normalized)) {
    return 'silver'
  }
  if (/季军|铜|三等奖|third|bronze/.test(normalized)) {
    return 'bronze'
  }
  if (/优秀|入围|honorable|merit|finalist/.test(normalized)) {
    return 'excellent'
  }

  return 'other'
}

function toAwardRecord(item: Competition): AwardRecord {
  return {
    id: item.id,
    title: item.title,
    category: item.category,
    happenedAt: item.happenedAt,
    contestLevel: item.contestLevel,
    rank: item.rank,
    award: item.award,
    teamName: item.teamName,
    memberNames: item.participants.map((participant) => participant.name),
    memberIds: item.participants.map((participant) => participant.id),
    awardTone: resolveAwardTone(item),
  }
}

function toCompetitionGroupKey(record: AwardRecord) {
  return [
    record.title,
    record.category,
    record.happenedAt ?? '',
    record.contestLevel ?? '',
  ].join('|')
}

function toSearchText(record: AwardRecord) {
  return [
    record.title,
    record.contestLevel ?? '',
    record.rank ?? '',
    record.award ?? '',
    record.teamName ?? '',
    record.memberNames.join(' '),
  ]
    .join(' ')
    .toLowerCase()
}

function toRecordTime(record: AwardRecord) {
  const fromDate = record.happenedAt ? Date.parse(record.happenedAt) : NaN
  if (Number.isFinite(fromDate)) {
    return fromDate
  }

  return 0
}

function toIndexedAwardRecord(item: Competition): IndexedAwardRecord {
  const record = toAwardRecord(item)
  return {
    ...record,
    searchText: toSearchText(record),
    happenedAtTime: toRecordTime(record),
  }
}

function sortRecordDesc(a: IndexedAwardRecord, b: IndexedAwardRecord) {
  if (a.happenedAtTime !== b.happenedAtTime) {
    return b.happenedAtTime - a.happenedAtTime
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

function exportAwardRecordsAsCsv(records: AwardRecord[]) {
  downloadCsv({
    filename: `gu-acmerdb-awards-${getCurrentDateLabel()}.csv`,
    headers: ['日期', '赛事', '分类', '比赛级别', '队伍', '名次', '奖项', '成员'],
    rows: records.map((record) => [
      record.happenedAt ?? '',
      record.title,
      CONTEST_TYPE_LABELS[record.category],
      record.contestLevel ?? '',
      record.teamName ?? '',
      record.rank ?? '',
      record.award ?? '',
      record.memberNames.join('、'),
    ]),
  })
}

function exportAwardStatsAsCsv(summary: StatsSummary) {
  const rows: Array<Array<string | number>> = [
    ['指标', '值'],
    ['获奖记录数', summary.totalRecords],
    ['覆盖赛事数', summary.uniqueCompetitions],
    ['覆盖成员数', summary.uniqueMembers],
    ['---', '---'],
    ['奖项等级分布', '数量'],
    ...(['gold', 'silver', 'bronze', 'excellent', 'other'] as AwardTone[]).map((tone) => [
      TONE_LABELS[tone],
      summary.toneCounts[tone],
    ]),
    ['---', '---'],
    ['赛事分类分布', '数量'],
    ...summary.categoryCounts.map((item) => [CONTEST_TYPE_LABELS[item.category], item.count]),
    ['---', '---'],
    ['获奖成员 Top10', '次数'],
    ...summary.memberTop.map((item) => [item.memberName, item.count]),
  ]

  downloadCsv({
    filename: `gu-acmerdb-award-stats-${getCurrentDateLabel()}.csv`,
    headers: rows[0].map((cell) => String(cell)),
    rows: rows.slice(1),
  })
}

export function AwardsPage() {
  const cached = peekAwardsOverview()
  const [competitions, setCompetitions] = useState<Competition[]>(() => cached ?? [])
  const [loading, setLoading] = useState(() => !cached)
  const [error, setError] = useState<string | null>(null)

  const [keyword, setKeyword] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [tierFilter, setTierFilter] = useState<AwardTierFilter>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[1])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError('尚未配置 Supabase，请先填写 .env.local。')
      setLoading(false)
      return
    }

    let disposed = false

    async function load() {
      const cachedResult = peekAwardsOverview()
      if (cachedResult) {
        setCompetitions(cachedResult)
        setLoading(false)
      } else {
        setLoading(true)
      }

      setError(null)

      try {
        const data = await fetchAwardsOverview()
        if (!disposed) {
          setCompetitions(data)
        }
      } catch (loadError) {
        if (!disposed) {
          setError(
            cachedResult
              ? null
              : loadError instanceof Error
                ? loadError.message
                : '加载获奖数据失败',
          )
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

  const allAwardRecords = useMemo(
    () => competitions.filter(hasAwardRecord).map(toIndexedAwardRecord).toSorted(sortRecordDesc),
    [competitions],
  )

  const filteredRecords = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase()

    return allAwardRecords.filter((record) => {
      if (categoryFilter !== 'all' && record.category !== categoryFilter) {
        return false
      }

      if (tierFilter !== 'all' && record.awardTone !== tierFilter) {
        return false
      }

      if (dateFrom) {
        if (!record.happenedAt || record.happenedAt < dateFrom) {
          return false
        }
      }

      if (dateTo) {
        if (!record.happenedAt || record.happenedAt > dateTo) {
          return false
        }
      }

      if (normalizedKeyword.length > 0) {
        return record.searchText.includes(normalizedKeyword)
      }

      return true
    })
  }, [allAwardRecords, categoryFilter, dateFrom, dateTo, keyword, tierFilter])

  const pageCount = useMemo(
    () => (filteredRecords.length > 0 ? Math.ceil(filteredRecords.length / pageSize) : 1),
    [filteredRecords.length, pageSize],
  )

  const pagedRecords = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredRecords.slice(start, start + pageSize)
  }, [filteredRecords, page, pageSize])

  useEffect(() => {
    setPage(1)
  }, [categoryFilter, dateFrom, dateTo, keyword, pageSize, tierFilter])

  useEffect(() => {
    setPage((previous) => Math.min(Math.max(previous, 1), pageCount))
  }, [pageCount])

  const summary = useMemo<StatsSummary>(() => {
    const toneCounts: Record<AwardTone, number> = {
      gold: 0,
      silver: 0,
      bronze: 0,
      excellent: 0,
      other: 0,
    }

    const competitionSet = new Set<string>()
    const memberCountMap = new Map<string, { name: string; count: number }>()
    const categoryCountMap = new Map<ContestCategory, number>()

    for (const record of filteredRecords) {
      toneCounts[record.awardTone] += 1
      competitionSet.add(toCompetitionGroupKey(record))
      categoryCountMap.set(record.category, (categoryCountMap.get(record.category) ?? 0) + 1)

      record.memberIds.forEach((memberId, index) => {
        const memberName = record.memberNames[index] ?? '未知成员'
        const current = memberCountMap.get(memberId)
        memberCountMap.set(memberId, {
          name: memberName,
          count: (current?.count ?? 0) + 1,
        })
      })
    }

    const categoryCounts = [...categoryCountMap.entries()]
      .map(([category, count]) => ({ category, count }))
      .toSorted((a, b) => b.count - a.count)

    const memberTop = [...memberCountMap.entries()]
      .map(([memberId, value]) => ({
        memberId,
        memberName: value.name,
        count: value.count,
      }))
      .toSorted((a, b) => b.count - a.count)
      .slice(0, 10)

    return {
      totalRecords: filteredRecords.length,
      uniqueCompetitions: competitionSet.size,
      uniqueMembers: memberCountMap.size,
      toneCounts,
      categoryCounts,
      memberTop,
    }
  }, [filteredRecords])

  const hasFilters =
    keyword.trim().length > 0 ||
    categoryFilter !== 'all' ||
    tierFilter !== 'all' ||
    dateFrom.length > 0 ||
    dateTo.length > 0

  const toneMax = Math.max(...TONE_ORDER.map((tone) => summary.toneCounts[tone]), 0)
  const categoryMax = summary.categoryCounts[0]?.count ?? 0
  const memberTopMax = summary.memberTop[0]?.count ?? 0

  useEffect(() => {
    if (loading || error || (pagedRecords.length === 0 && summary.memberTop.length === 0)) {
      return
    }

    let timer: number | null = null
    let idleHandle: number | null = null

    const runPrefetch = () => {
      pagedRecords
        .slice(0, 6)
        .forEach((record) => preloadCompetitionDetail(record.id))
      summary.memberTop
        .slice(0, 4)
        .forEach((member) => preloadMemberDetail(member.memberId))
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
  }, [error, loading, pagedRecords, summary.memberTop])

  return (
    <div className="stack awards-page">
      <section className="panel awards-filter-panel">
        <div className="awards-filter-head">
          <h2>获奖查询与统计</h2>
          {!loading && !error ? (
            <span className="awards-total-pill">共 {filteredRecords.length} 条</span>
          ) : null}
        </div>

        <div className="awards-filter-grid">
          <label>
            关键词
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="赛事 / 队伍 / 奖项 / 队员"
            />
          </label>

          <label>
            赛事分类
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value as CategoryFilter)}
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
            奖项等级
            <select
              value={tierFilter}
              onChange={(event) => setTierFilter(event.target.value as AwardTierFilter)}
            >
              <option value="all">全部等级</option>
              <option value="gold">金奖/冠军</option>
              <option value="silver">银奖/亚军</option>
              <option value="bronze">铜奖/季军</option>
              <option value="excellent">优秀/入围</option>
              <option value="other">其他</option>
            </select>
          </label>

          <label>
            开始日期
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </label>

          <label>
            结束日期
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </label>
        </div>

        <div className="awards-toolbar">
          <div className="awards-toolbar-actions">
            <button
              className="btn"
              type="button"
              disabled={!hasFilters}
              onClick={() => {
                setKeyword('')
                setCategoryFilter('all')
                setTierFilter('all')
                setDateFrom('')
                setDateTo('')
              }}
            >
              清空筛选
            </button>
            <button
              className="btn"
              type="button"
              disabled={loading || Boolean(error) || filteredRecords.length === 0}
              onClick={() => exportAwardRecordsAsCsv(filteredRecords)}
            >
              导出明细 CSV
            </button>
            <button
              className="btn"
              type="button"
              disabled={loading || Boolean(error) || filteredRecords.length === 0}
              onClick={() => exportAwardStatsAsCsv(summary)}
            >
              导出统计 CSV
            </button>
          </div>

          <label className="awards-page-size-label">
            每页数量
            <select
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
              disabled={loading || Boolean(error)}
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={`awards-page-size-${option}`} value={option}>
                  {option} 条/页
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {loading ? <p className="status">正在加载获奖数据...</p> : null}
      {error ? <p className="status status-error">{error}</p> : null}

      {!loading && !error ? (
        filteredRecords.length === 0 ? (
          <EmptyState title="暂无匹配获奖记录" />
        ) : (
          <>
            <section className="awards-kpi-grid">
              <article className="awards-kpi-card">
                <span>获奖记录</span>
                <strong>{summary.totalRecords}</strong>
              </article>
              <article className="awards-kpi-card">
                <span>覆盖赛事</span>
                <strong>{summary.uniqueCompetitions}</strong>
              </article>
              <article className="awards-kpi-card">
                <span>覆盖队员</span>
                <strong>{summary.uniqueMembers}</strong>
              </article>
            </section>

            <section className="awards-insight-layout">
              <div className="awards-insight-stack">
                <article className="awards-insight-card">
                  <h3>奖项等级</h3>
                  <ul className="awards-rank-list">
                    {TONE_ORDER.map((tone) => (
                      <li key={tone} className="awards-rank-item">
                        <div className="awards-rank-main">
                          <span className="awards-rank-label">{TONE_LABELS[tone]}</span>
                          <span className="awards-rank-track">
                            <span
                              className={`awards-rank-fill awards-rank-fill-${tone}`}
                              style={{ width: `${toScalePercent(summary.toneCounts[tone], toneMax)}%` }}
                            />
                          </span>
                        </div>
                        <strong>{summary.toneCounts[tone]}</strong>
                      </li>
                    ))}
                  </ul>
                </article>

                <article className="awards-insight-card">
                  <h3>赛事分类</h3>
                  {summary.categoryCounts.length === 0 ? (
                    <p className="status-hint">暂无数据</p>
                  ) : (
                    <ul className="awards-rank-list">
                      {summary.categoryCounts.map((item) => (
                        <li key={item.category} className="awards-rank-item">
                          <div className="awards-rank-main">
                            <span className="awards-rank-label">
                              {CONTEST_TYPE_LABELS[item.category]}
                            </span>
                            <span className="awards-rank-track">
                              <span
                                className="awards-rank-fill awards-rank-fill-default"
                                style={{ width: `${toScalePercent(item.count, categoryMax)}%` }}
                              />
                            </span>
                          </div>
                          <strong>{item.count}</strong>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              </div>

              <article className="awards-insight-card awards-insight-card-top">
                <h3>Top10 队员</h3>
                {summary.memberTop.length === 0 ? (
                  <p className="status-hint">暂无数据</p>
                ) : (
                  <ul className="awards-rank-list">
                    {summary.memberTop.map((item) => (
                      <li key={item.memberId} className="awards-rank-item">
                        <div className="awards-rank-main">
                          <Link
                            className="inline-link awards-member-link"
                            to={`/member/${item.memberId}`}
                            onMouseEnter={() => preloadMemberDetail(item.memberId)}
                            onFocus={() => preloadMemberDetail(item.memberId)}
                            onTouchStart={() => preloadMemberDetail(item.memberId)}
                          >
                            {item.memberName}
                          </Link>
                          <span className="awards-rank-track">
                            <span
                              className="awards-rank-fill awards-rank-fill-member"
                              style={{ width: `${toScalePercent(item.count, memberTopMax)}%` }}
                            />
                          </span>
                        </div>
                        <strong>{item.count}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            </section>

            <section className="panel awards-table-panel">
              <div className="awards-table-head">
                <h3>获奖明细</h3>
                <span className="status-hint">
                  第 {page} / {pageCount} 页（本页 {pagedRecords.length} 条）
                </span>
              </div>

              <div className="table-scroll awards-table-scroll">
                <table className="awards-table">
                  <thead>
                    <tr>
                      <th>日期</th>
                      <th>赛事</th>
                      <th>分类</th>
                      <th>名次</th>
                      <th>奖项</th>
                      <th>队伍</th>
                      <th>成员</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRecords.map((record) => (
                      <tr key={record.id}>
                        <td>{record.happenedAt ?? '-'}</td>
                        <td>
                          <Link
                            className="inline-link"
                            to={`/competition/${record.id}`}
                            onMouseEnter={() => preloadCompetitionDetail(record.id)}
                            onFocus={() => preloadCompetitionDetail(record.id)}
                            onTouchStart={() => preloadCompetitionDetail(record.id)}
                          >
                            {record.title}
                          </Link>
                        </td>
                        <td>
                          <ContestTypeTag category={record.category} />
                        </td>
                        <td>{record.rank ?? '-'}</td>
                        <td>{record.award ?? '-'}</td>
                        <td>{record.teamName ?? '-'}</td>
                        <td>
                          {record.memberIds.length === 0 ? (
                            '-'
                          ) : (
                            <div className="awards-member-list">
                              {record.memberIds.map((memberId, index) => (
                                <span key={`${record.id}-${memberId}`}>
                                  {index > 0 ? '、' : ''}
                                  <Link
                                    className="inline-link"
                                    to={`/member/${memberId}`}
                                    onMouseEnter={() => preloadMemberDetail(memberId)}
                                    onFocus={() => preloadMemberDetail(memberId)}
                                    onTouchStart={() => preloadMemberDetail(memberId)}
                                  >
                                    {record.memberNames[index] ?? '未知成员'}
                                  </Link>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pagination-row awards-pagination">
                <button
                  className="btn"
                  type="button"
                  onClick={() => setPage((previous) => Math.max(1, previous - 1))}
                  disabled={page <= 1}
                >
                  上一页
                </button>
                <span className="status-hint">
                  第 {page} / {pageCount} 页
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
            </section>
          </>
        )
      ) : null}
    </div>
  )
}
