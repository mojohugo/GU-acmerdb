import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ContestTypeTag } from '../components/ContestTypeTag'
import { EmptyState } from '../components/EmptyState'
import { CONTEST_TYPE_DESCRIPTIONS, CONTEST_TYPE_ORDER } from '../lib/constants'
import { fetchHomeStats, peekHomeStats } from '../lib/api'
import { isSupabaseConfigured } from '../lib/supabase'
import type { HomeStats } from '../types'

export function HomePage() {
  const cachedStats = peekHomeStats()
  const [stats, setStats] = useState<HomeStats | null>(() => cachedStats)
  const [loading, setLoading] = useState(() => !cachedStats)
  const [error, setError] = useState<string | null>(null)

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
      { label: '队员总数', value: stats.membersCount },
      { label: '当前活跃队员', value: stats.activeMembersCount },
      { label: '赛事记录总数', value: stats.competitionsCount },
    ]
  }, [stats])

  return (
    <div className="stack">
      <section className="hero-card">
        <p className="hero-kicker">Guangzhou University</p>
        <h2>ACM 校队信息与成绩记录</h2>
        <p>
          参考 OIerDb 的浏览体验，重点支持按届别查看新生赛、校赛、ICPC/CCPC
          区域赛、省赛、蓝桥杯、天梯赛。
        </p>
        <div className="hero-actions">
          <Link className="btn btn-solid" to="/members">
            查看队员库
          </Link>
          <Link className="btn" to="/cohorts">
            查看届别赛事
          </Link>
        </div>
      </section>

      {loading ? <p className="status">正在加载首页统计...</p> : null}
      {error ? <p className="status status-error">{error}</p> : null}

      {!loading && !error && stats ? (
        <>
          <section className="stats-grid">
            {statItems.map((item) => (
              <article key={item.label} className="stat-card">
                <p>{item.label}</p>
                <strong>{item.value}</strong>
              </article>
            ))}
          </section>

          <section className="panel">
            <div className="panel-header">
              <h3>最近赛事记录</h3>
            </div>
            {stats.latestCompetitions.length === 0 ? (
              <EmptyState title="暂无赛事记录" description="请先在管理页面录入赛事。" />
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>日期</th>
                      <th>赛事</th>
                      <th>分类</th>
                      <th>届别</th>
                      <th>奖项</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.latestCompetitions.map((competition) => (
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
                          {competition.cohortYear
                            ? `${competition.cohortYear} 级`
                            : '-'}
                        </td>
                        <td>{competition.award ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}

      <section className="panel">
        <div className="panel-header">
          <h3>支持的赛事类别</h3>
        </div>
        <div className="type-grid">
          {CONTEST_TYPE_ORDER.filter((type) => type !== 'other').map((type) => (
            <article key={type} className="type-item">
              <ContestTypeTag category={type} />
              <p>{CONTEST_TYPE_DESCRIPTIONS[type]}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
