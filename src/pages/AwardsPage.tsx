import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ContestTypeTag } from '../components/ContestTypeTag'
import { EmptyState } from '../components/EmptyState'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { fetchAwardsOverview, peekAwardsOverview } from '../lib/api'
import { CONTEST_TYPE_LABELS, CONTEST_TYPE_ORDER } from '../lib/constants'
import { downloadCsv } from '../lib/csv'
import { isSupabaseConfigured } from '../lib/supabase'
import type { Competition, ContestCategory } from '../types'

type CategoryFilter = ContestCategory | 'all'
type AwardTone = 'gold' | 'silver' | 'bronze' | 'excellent' | 'other'
type AwardTierFilter = AwardTone | 'all'
const PAGE_SIZE_OPTIONS = [10, 20, 50] as const

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
  const debouncedKeyword = useDebouncedValue(keyword, 250)

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
    const normalizedKeyword = debouncedKeyword.trim().toLowerCase()

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
  }, [allAwardRecords, categoryFilter, dateFrom, dateTo, debouncedKeyword, tierFilter])

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
  }, [categoryFilter, dateFrom, dateTo, debouncedKeyword, pageSize, tierFilter])

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

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-header">
          <h2>获奖查询与统计</h2>
          <p>支持按关键词、赛事分类、奖项等级、日期范围筛选，并可导出查询结果和统计摘要。</p>
        </div>

        <div className="filters">
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

        <div className="filters-toolbar">
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
            导出查询结果 CSV
          </button>
          <button
            className="btn"
            type="button"
            disabled={loading || Boolean(error) || filteredRecords.length === 0}
            onClick={() => exportAwardStatsAsCsv(summary)}
          >
            导出统计摘要 CSV
          </button>
          {!loading && !error ? (
            <span className="status-hint">共 {filteredRecords.length} 条记录</span>
          ) : null}
          <label>
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

        {loading ? <p className="status">正在加载获奖数据...</p> : null}
        {error ? <p className="status status-error">{error}</p> : null}

        {!loading && !error ? (
          filteredRecords.length === 0 ? (
            <EmptyState title="暂无匹配获奖记录" description="可调整筛选条件后重试。" />
          ) : (
            <>
              <section className="stats-grid award-stats-grid">
                <article className="stat-card">
                  <div className="stat-card-head">
                    <p>获奖记录</p>
                  </div>
                  <strong>{summary.totalRecords}</strong>
                </article>
                <article className="stat-card">
                  <div className="stat-card-head">
                    <p>覆盖赛事</p>
                  </div>
                  <strong>{summary.uniqueCompetitions}</strong>
                </article>
                <article className="stat-card">
                  <div className="stat-card-head">
                    <p>覆盖队员</p>
                  </div>
                  <strong>{summary.uniqueMembers}</strong>
                </article>
              </section>

              <section className="award-analysis-grid">
                <article className="sub-panel award-analysis-card">
                  <h4>奖项等级分布</h4>
                  <ul className="simple-list">
                    {(['gold', 'silver', 'bronze', 'excellent', 'other'] as AwardTone[]).map((tone) => (
                      <li key={tone}>
                        <span>{TONE_LABELS[tone]}</span>
                        <strong>{summary.toneCounts[tone]}</strong>
                      </li>
                    ))}
                  </ul>
                </article>

                <article className="sub-panel award-analysis-card">
                  <h4>赛事分类分布</h4>
                  <ul className="simple-list">
                    {summary.categoryCounts.length === 0 ? (
                      <li>
                        <span>暂无数据</span>
                        <strong>0</strong>
                      </li>
                    ) : (
                      summary.categoryCounts.map((item) => (
                        <li key={item.category}>
                          <span>{CONTEST_TYPE_LABELS[item.category]}</span>
                          <strong>{item.count}</strong>
                        </li>
                      ))
                    )}
                  </ul>
                </article>

                <article className="sub-panel award-analysis-card">
                  <h4>获奖成员 Top10</h4>
                  <ul className="simple-list">
                    {summary.memberTop.length === 0 ? (
                      <li>
                        <span>暂无数据</span>
                        <strong>0</strong>
                      </li>
                    ) : (
                      summary.memberTop.map((item) => (
                        <li key={item.memberId}>
                          <Link className="inline-link" to={`/member/${item.memberId}`}>
                            {item.memberName}
                          </Link>
                          <strong>{item.count}</strong>
                        </li>
                      ))
                    )}
                  </ul>
                </article>
              </section>

              <div className="table-scroll">
                <table>
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
                          <Link className="inline-link" to={`/competition/${record.id}`}>
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
                          {record.memberIds.length === 0
                            ? '-'
                            : record.memberIds.map((memberId, index) => (
                                <span key={`${record.id}-${memberId}`}>
                                  {index > 0 ? '、' : ''}
                                  <Link className="inline-link" to={`/member/${memberId}`}>
                                    {record.memberNames[index] ?? '未知成员'}
                                  </Link>
                                </span>
                              ))}
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
                  onClick={() => setPage((previous) => Math.max(1, previous - 1))}
                  disabled={page <= 1}
                >
                  上一页
                </button>
                <span className="status-hint">
                  第 {page} / {pageCount} 页（本页 {pagedRecords.length} 条）
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
            </>
          )
        ) : null}

        <p className="todo-note">
          TODO: 后续可补充“跨年度对比图、按赛事级别聚合、成员奖项趋势曲线、导出任务中心（异步）”。
        </p>
      </section>
    </div>
  )
}
