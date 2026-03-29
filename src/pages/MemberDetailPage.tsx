import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ContestTypeTag } from '../components/ContestTypeTag'
import { EmptyState } from '../components/EmptyState'
import { AwardBadge, RankBadge } from '../components/ResultBadge'
import { fetchMemberDetail, peekMemberDetail } from '../lib/api'
import { isSupabaseConfigured } from '../lib/supabase'
import type { MemberDetail } from '../types'

export function MemberDetailPage() {
  const { memberId } = useParams()
  const cachedDetail = memberId ? peekMemberDetail(memberId) : null
  const [detail, setDetail] = useState<MemberDetail | null>(() => cachedDetail)
  const [loading, setLoading] = useState(() => !cachedDetail)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError('尚未配置 Supabase，请先填写 .env.local。')
      setLoading(false)
      return
    }

    if (!memberId) {
      setError('缺少 memberId 参数。')
      setLoading(false)
      return
    }

    let disposed = false

    async function load() {
      if (!memberId) {
        return
      }

      const cached = peekMemberDetail(memberId)
      if (cached) {
        setDetail(cached)
        setLoading(false)
      } else {
        setLoading(true)
      }
      setError(null)

      try {
        const result = await fetchMemberDetail(memberId)
        if (!disposed) {
          setDetail(result)
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
  }, [memberId])

  return (
    <div className="stack">
      <Link className="inline-link" to="/members">
        返回队员列表
      </Link>

      {loading ? <p className="status">正在加载队员详情...</p> : null}
      {error ? <p className="status status-error">{error}</p> : null}

      {!loading && !error && detail ? (
        <>
          <section className="panel">
            <div className="panel-header">
              <h2>{detail.name}</h2>
            </div>
            <div className="detail-grid">
              <article>
                <h4>届别</h4>
                <p>{detail.cohortYear} 级</p>
              </article>
              <article>
                <h4>handle</h4>
                <p>{detail.handle ?? '-'}</p>
              </article>
              <article>
                <h4>专业</h4>
                <p>{detail.major ?? '-'}</p>
              </article>
              <article>
                <h4>状态</h4>
                <p>{detail.isActive ? '在队' : '已毕业/离队'}</p>
              </article>
            </div>
            {detail.bio ? (
              <article className="bio-block">
                <h4>简介</h4>
                <p>{detail.bio}</p>
              </article>
            ) : null}
          </section>

          <section className="panel">
            <div className="panel-header">
              <h3>赛事记录</h3>
              <p>和 OIerDb 一样，优先展示成绩明细。</p>
            </div>

            {detail.competitions.length === 0 ? (
              <EmptyState
                title="暂无赛事记录"
                description="可在管理页面新增赛事并关联队员。"
              />
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>日期</th>
                      <th>赛事</th>
                      <th>分类</th>
                      <th>队伍/名次</th>
                      <th>奖项</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.competitions.map((competition) => (
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
                          <div className="result-inline-wrap">
                            <span>{competition.teamName ?? '-'}</span>
                            {competition.rank ? <RankBadge rank={competition.rank} /> : null}
                          </div>
                        </td>
                        <td>
                          {competition.award ? <AwardBadge award={competition.award} /> : '-'}
                        </td>
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
