import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { fetchAvailableCohorts, fetchMembers } from '../lib/api'
import { isSupabaseConfigured } from '../lib/supabase'
import type { Member } from '../types'

export function MembersPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [cohorts, setCohorts] = useState<number[]>([])
  const [query, setQuery] = useState('')
  const [cohortYear, setCohortYear] = useState<number | ''>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError('尚未配置 Supabase，请先填写 .env.local。')
      setLoading(false)
      return
    }

    let disposed = false

    async function loadCohorts() {
      try {
        const items = await fetchAvailableCohorts()
        if (!disposed) {
          setCohorts(items)
        }
      } catch {
        // Keep page usable even when this auxiliary query fails.
      }
    }

    void loadCohorts()

    return () => {
      disposed = true
    }
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return
    }

    let disposed = false

    async function loadMembers() {
      setLoading(true)
      setError(null)

      try {
        const result = await fetchMembers({
          query,
          cohortYear: cohortYear === '' ? undefined : cohortYear,
        })

        if (!disposed) {
          setMembers(result)
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

    void loadMembers()

    return () => {
      disposed = true
    }
  }, [query, cohortYear])

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-header">
          <h2>队员列表</h2>
          <p>按姓名/ID 搜索，支持按届别筛选。</p>
        </div>

        <div className="filters">
          <label>
            关键词
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="姓名或 handle"
            />
          </label>

          <label>
            届别
            <select
              value={cohortYear}
              onChange={(event) => {
                const value = event.target.value
                setCohortYear(value ? Number(value) : '')
              }}
            >
              <option value="">全部届别</option>
              {cohorts.map((year) => (
                <option key={year} value={year}>
                  {year} 级
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading ? <p className="status">正在加载队员数据...</p> : null}
        {error ? <p className="status status-error">{error}</p> : null}

        {!loading && !error ? (
          members.length === 0 ? (
            <EmptyState title="没有匹配队员" description="可调整筛选条件后重试。" />
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>姓名</th>
                    <th>届别</th>
                    <th>handle</th>
                    <th>专业</th>
                    <th>状态</th>
                    <th>详情</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.id}>
                      <td>{member.name}</td>
                      <td>{member.cohortYear} 级</td>
                      <td>{member.handle ?? '-'}</td>
                      <td>{member.major ?? '-'}</td>
                      <td>{member.isActive ? '在队' : '已毕业/离队'}</td>
                      <td>
                        <Link className="inline-link" to={`/member/${member.id}`}>
                          查看
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </section>
    </div>
  )
}
