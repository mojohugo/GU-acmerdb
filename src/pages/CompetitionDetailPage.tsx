import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ContestTypeTag } from '../components/ContestTypeTag'
import { EmptyState } from '../components/EmptyState'
import { fetchCompetitionDetail, peekCompetitionDetail } from '../lib/api'
import { isSupabaseConfigured } from '../lib/supabase'
import type { CompetitionDetail } from '../types'

export function CompetitionDetailPage() {
  const { competitionId } = useParams()
  const cached = competitionId ? peekCompetitionDetail(competitionId) : null
  const [detail, setDetail] = useState<CompetitionDetail | null>(() => cached)
  const [loading, setLoading] = useState(() => !cached)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError('尚未配置 Supabase，请先填写 .env.local。')
      setLoading(false)
      return
    }

    if (!competitionId) {
      setError('缺少 competitionId 参数。')
      setLoading(false)
      return
    }

    let disposed = false

    async function load() {
      if (!competitionId) {
        return
      }

      const cachedDetail = peekCompetitionDetail(competitionId)
      if (cachedDetail) {
        setDetail(cachedDetail)
        setLoading(false)
      } else {
        setLoading(true)
      }
      setError(null)

      try {
        const result = await fetchCompetitionDetail(competitionId)
        if (!disposed) {
          setDetail(result)
        }
      } catch (loadError) {
        if (!disposed) {
          setError(
            cachedDetail
              ? null
              : loadError instanceof Error
                ? loadError.message
                : '加载失败',
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
  }, [competitionId])

  return (
    <div className="stack">
      <Link className="inline-link" to="/cohorts">
        返回赛事时间线
      </Link>

      {loading ? <p className="status">正在加载比赛详情...</p> : null}
      {error ? <p className="status status-error">{error}</p> : null}

      {!loading && !error && detail ? (
        <>
          <section className="panel">
            <div className="panel-header">
              <h2>{detail.focus.title}</h2>
              <p>同一比赛战绩已按“名次 → 奖项”排序展示。</p>
            </div>

            <div className="detail-grid">
              <article>
                <h4>分类</h4>
                <p>
                  <ContestTypeTag category={detail.focus.category} />
                </p>
              </article>
              <article>
                <h4>赛季</h4>
                <p>{detail.focus.seasonYear}</p>
              </article>
              <article>
                <h4>日期</h4>
                <p>{detail.focus.happenedAt ?? '-'}</p>
              </article>
              <article>
                <h4>比赛级别</h4>
                <p>{detail.focus.contestLevel ?? '-'}</p>
              </article>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h3>获奖与参赛名单</h3>
            </div>

            {detail.standings.length === 0 ? (
              <EmptyState title="暂无战绩记录" description="请先在后台录入比赛战绩。" />
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>序号</th>
                      <th>名次</th>
                      <th>奖项</th>
                      <th>队伍</th>
                      <th>成员</th>
                      <th>备注</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.standings.map((entry, index) => (
                      <tr key={entry.id}>
                        <td>{index + 1}</td>
                        <td>{entry.rank ?? '-'}</td>
                        <td>{entry.award ?? '-'}</td>
                        <td>{entry.teamName ?? '-'}</td>
                        <td>
                          {entry.participants.length > 0 ? (
                            entry.participants.map((member, participantIndex) => (
                              <span key={member.id}>
                                {participantIndex > 0 ? '、' : ''}
                                <Link className="inline-link" to={`/member/${member.id}`}>
                                  {member.name}
                                </Link>
                              </span>
                            ))
                          ) : (
                            '-'
                          )}
                        </td>
                        <td>{entry.remark ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}
