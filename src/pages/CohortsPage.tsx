import { useEffect, useMemo, useState } from 'react'
import { ContestTypeTag } from '../components/ContestTypeTag'
import { EmptyState } from '../components/EmptyState'
import { fetchCohortOverview } from '../lib/api'
import { CONTEST_TYPE_LABELS, CONTEST_TYPE_ORDER } from '../lib/constants'
import { isSupabaseConfigured } from '../lib/supabase'
import type { Competition, ContestCategory } from '../types'

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

export function CohortsPage() {
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError('尚未配置 Supabase，请先填写 .env.local。')
      setLoading(false)
      return
    }

    let disposed = false

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const result = await fetchCohortOverview()
        if (!disposed) {
          setCompetitions(result)
        }
      } catch (loadError) {
        if (!disposed) {
          setError(loadError instanceof Error ? loadError.message : '加载失败')
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

  const sections = useMemo(() => groupByCohort(competitions), [competitions])

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-header">
          <h2>按届别查看赛事</h2>
          <p>
            可看到每一届在新生赛、校赛、ICPC/CCPC
            区域赛、省赛、蓝桥杯、天梯赛上的记录。
          </p>
        </div>

        {loading ? <p className="status">正在加载届别赛事...</p> : null}
        {error ? <p className="status status-error">{error}</p> : null}

        {!loading && !error ? (
          sections.length === 0 ? (
            <EmptyState title="暂无赛事数据" description="请先在管理页面录入赛事。" />
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
                                  <strong>{competition.title}</strong>
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
                                {competition.remark ? (
                                  <p>备注: {competition.remark}</p>
                                ) : null}
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
      </section>
    </div>
  )
}
