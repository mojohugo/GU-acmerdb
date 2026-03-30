import { useEffect, useMemo, useState } from 'react'
import { Activity, Trophy, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ContestTypeTag } from '../components/ContestTypeTag'
import { EmptyState } from '../components/EmptyState'
import { CONTEST_TYPE_DESCRIPTIONS, CONTEST_TYPE_ORDER } from '../lib/constants'
import { fetchHomeStats, peekHomeStats } from '../lib/api'
import { isSupabaseConfigured } from '../lib/supabase'
import type { HomeStats } from '../types'

const LATEST_PAGE_SIZE_OPTIONS = [5, 10, 20] as const

function toCompetitionGroupKey(input: HomeStats['latestCompetitions'][number]) {
  return [
    input.title,
    input.category,
    String(input.seasonYear),
    input.happenedAt ?? '',
    input.contestLevel ?? '',
  ].join('|')
}

export function HomePage() {
  const cachedStats = peekHomeStats()
  const [stats, setStats] = useState<HomeStats | null>(() => cachedStats)
  const [loading, setLoading] = useState(() => !cachedStats)
  const [error, setError] = useState<string | null>(null)
  const [latestPage, setLatestPage] = useState(1)
  const [latestPageSize, setLatestPageSize] = useState<number>(LATEST_PAGE_SIZE_OPTIONS[1])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      setError('尚未配置 Supabase，请先填写 .env.local。')
      return
    }

    let disposed = false

    async function load() {
      const cached = peekHomeStats()
      if (cached) {
        setStats(cached)
        setLoading(false)
      } else {
        setLoading(true)
      }
      setError(null)

      try {
        const result = await fetchHomeStats()
        if (!disposed) {
          setStats(result)
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

  const statItems = useMemo(() => {
    if (!stats) {
      return []
    }

    return [
      { label: '队员总数', value: stats.membersCount, Icon: Users },
      { label: '当前活跃队员', value: stats.activeMembersCount, Icon: Activity },
      { label: '赛事记录总数', value: stats.competitionsCount, Icon: Trophy },
    ]
  }, [stats])

  const latestCompetitionPreviews = useMemo(() => {
    if (!stats) {
      return []
    }

    const groupMap = new Map<string, HomeStats['latestCompetitions'][number]>()
    for (const item of stats.latestCompetitions) {
      const key = toCompetitionGroupKey(item)
      if (!groupMap.has(key)) {
        groupMap.set(key, item)
      }
    }

    return [...groupMap.values()]
  }, [stats])

  const latestPageCount = useMemo(
    () =>
      latestCompetitionPreviews.length > 0
        ? Math.ceil(latestCompetitionPreviews.length / latestPageSize)
        : 1,
    [latestCompetitionPreviews.length, latestPageSize],
  )

  const pagedLatestCompetitionPreviews = useMemo(() => {
    const start = (latestPage - 1) * latestPageSize
    return latestCompetitionPreviews.slice(start, start + latestPageSize)
  }, [latestCompetitionPreviews, latestPage, latestPageSize])

  const latestRecordedAt = useMemo(() => {
    let candidate: string | null = null
    for (const competition of latestCompetitionPreviews) {
      if (!competition.happenedAt) {
        continue
      }
      if (!candidate || competition.happenedAt > candidate) {
        candidate = competition.happenedAt
      }
    }
    return candidate
  }, [latestCompetitionPreviews])

  useEffect(() => {
    setLatestPage(1)
  }, [latestPageSize])

  useEffect(() => {
    setLatestPage((previous) => Math.min(Math.max(previous, 1), latestPageCount))
  }, [latestPageCount])

  return (
    <div className="stack home-page">
      <section className="hero-card home-hero">
        <div className="home-hero-main">
          <div className="home-hero-copy">
            <p className="hero-kicker">Guangzhou University</p>
            <h2>ACM 校队信息与成绩记录</h2>
            <p>
              把队员履历、赛事记录和获奖信息放在同一个入口，查历史、看全貌都会更顺手。
            </p>
            <div className="hero-points">
              <span>赛事时间线回看</span>
              <span>成员维度检索</span>
              <span>管理员在线维护</span>
            </div>
          </div>
          <div className="home-hero-side">
            <p className="home-hero-side-title">导航入口</p>
            <p className="home-hero-side-note">
              首页、队员档案、赛事时间线、获奖统计、管理均已放到顶部导航栏。
            </p>
            <p className="home-hero-side-note">
              最近赛事日期：{latestRecordedAt ?? '暂无'}
            </p>
          </div>
        </div>
      </section>

      {loading ? <p className="status">正在加载首页统计...</p> : null}
      {error ? <p className="status status-error">{error}</p> : null}

      {!loading && !error && stats ? (
        <>
          <section className="stats-grid home-stats-grid">
            {statItems.map((item) => (
              <article key={item.label} className="stat-card home-stat-card">
                <div className="stat-card-head">
                  <item.Icon size={15} aria-hidden="true" />
                  <p>{item.label}</p>
                </div>
                <strong>{item.value}</strong>
              </article>
            ))}
          </section>

          <section className="panel home-latest-panel">
            <div className="panel-header">
              <h3>最近赛事记录</h3>
              <p>默认展示最新录入的赛事分组，可直接进入详情查看战绩与附件。</p>
            </div>
            <div className="filters-toolbar">
              <span className="status-hint">
                共 {latestCompetitionPreviews.length} 条记录，当前第 {latestPage} / {latestPageCount} 页
              </span>
              <label>
                每页数量
                <select
                  value={latestPageSize}
                  onChange={(event) => setLatestPageSize(Number(event.target.value))}
                >
                  {LATEST_PAGE_SIZE_OPTIONS.map((option) => (
                    <option key={`home-latest-page-size-${option}`} value={option}>
                      {option} 条/页
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {latestCompetitionPreviews.length === 0 ? (
              <EmptyState title="暂无赛事记录" description="请先在管理页面录入赛事。" />
            ) : (
              <div className="table-scroll">
                <table className="home-latest-table">
                  <thead>
                    <tr>
                      <th>日期</th>
                      <th>赛事</th>
                      <th>分类</th>
                      <th>详情</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedLatestCompetitionPreviews.map((competition) => (
                      <tr key={competition.id}>
                        <td>{competition.happenedAt ?? '-'}</td>
                        <td>
                          <Link className="inline-link" to={`/competition/${competition.id}`}>
                            {competition.title}
                          </Link>
                        </td>
                        <td>
                          <ContestTypeTag category={competition.category} />
                        </td>
                        <td>
                          <Link className="inline-link" to={`/competition/${competition.id}`}>
                            查看比赛
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {latestCompetitionPreviews.length > 0 ? (
              <div className="pagination-row">
                <button
                  className="btn"
                  type="button"
                  onClick={() => setLatestPage((previous) => Math.max(1, previous - 1))}
                  disabled={latestPage <= 1}
                >
                  上一页
                </button>
                <span className="status-hint">
                  第 {latestPage} / {latestPageCount} 页（本页 {pagedLatestCompetitionPreviews.length}{' '}
                  条）
                </span>
                <button
                  className="btn"
                  type="button"
                  onClick={() =>
                    setLatestPage((previous) => Math.min(latestPageCount, previous + 1))
                  }
                  disabled={latestPage >= latestPageCount}
                >
                  下一页
                </button>
              </div>
            ) : null}
          </section>
        </>
      ) : null}

      <section className="panel home-type-panel">
        <div className="panel-header">
          <h3>支持的赛事类别</h3>
        </div>
        <div className="type-grid">
          {CONTEST_TYPE_ORDER.filter((type) => type !== 'other').map((type) => (
            <article key={type} className="type-item home-type-item">
              <ContestTypeTag category={type} />
              <p>{CONTEST_TYPE_DESCRIPTIONS[type]}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
