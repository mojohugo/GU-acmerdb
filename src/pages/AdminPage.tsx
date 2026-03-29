import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ContestTypeTag } from '../components/ContestTypeTag'
import {
  createCompetition,
  createMember,
  deleteMember,
  fetchCohortOverview,
  fetchMembers,
  getAdminSessionWithProfile,
  peekCohortOverview,
  peekMembers,
  signInAsAdmin,
  signOutAdmin,
  updateMember,
} from '../lib/api'
import { CONTEST_TYPE_LABELS, CONTEST_TYPE_ORDER } from '../lib/constants'
import { isSupabaseConfigured } from '../lib/supabase'
import type {
  Competition,
  CompetitionDraft,
  ContestCategory,
  Member,
  MemberDraft,
} from '../types'

type MemberForm = {
  name: string
  handle: string
  cohortYear: string
  major: string
  isActive: boolean
}

type CompetitionForm = {
  title: string
  category: ContestCategory
  seasonYear: string
  contestLevel: string
  happenedAt: string
  remark: string
}

const initialMemberForm: MemberForm = {
  name: '',
  handle: '',
  cohortYear: '',
  major: '',
  isActive: true,
}

const initialCompetitionForm: CompetitionForm = {
  title: '',
  category: 'freshman',
  seasonYear: '',
  contestLevel: '',
  happenedAt: '',
  remark: '',
}

function toMemberDraft(form: MemberForm): MemberDraft {
  const cohortYear = Number(form.cohortYear)
  if (!form.name.trim() || !Number.isFinite(cohortYear) || cohortYear <= 0) {
    throw new Error('请填写正确的队员姓名和届别')
  }
  return {
    name: form.name.trim(),
    handle: form.handle.trim() || undefined,
    cohortYear,
    major: form.major.trim() || undefined,
    isActive: form.isActive,
  }
}

function toCompetitionDraft(form: CompetitionForm): CompetitionDraft {
  const seasonYear = Number(form.seasonYear)
  if (!form.title.trim() || !Number.isFinite(seasonYear) || seasonYear <= 0) {
    throw new Error('请填写正确的赛事名称和赛季年份')
  }

  return {
    title: form.title.trim(),
    category: form.category,
    seasonYear,
    contestLevel: form.contestLevel.trim() || undefined,
    happenedAt: form.happenedAt || undefined,
    remark: form.remark.trim() || undefined,
    memberIds: [],
  }
}

export function AdminPage() {
  const [checking, setChecking] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminName, setAdminName] = useState('')
  const [loadingData, setLoadingData] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [members, setMembers] = useState<Member[]>(() => peekMembers() ?? [])
  const [competitions, setCompetitions] = useState<Competition[]>(
    () => peekCohortOverview() ?? [],
  )

  const [memberForm, setMemberForm] = useState<MemberForm>(initialMemberForm)
  const [competitionForm, setCompetitionForm] = useState<CompetitionForm>(
    initialCompetitionForm,
  )

  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  const [editMemberForm, setEditMemberForm] = useState<MemberForm>(initialMemberForm)

  const competitionGroups = useMemo(() => {
    const map = new Map<
      string,
      { id: string; title: string; category: ContestCategory; happenedAt: string | null; contestLevel: string | null; standingsCount: number }
    >()

    for (const item of competitions) {
      const groupKey = [
        item.title,
        item.category,
        String(item.seasonYear),
        item.happenedAt ?? '',
        item.contestLevel ?? '',
      ].join('|')

      const hasStanding =
        Boolean(item.rank?.trim()) ||
        Boolean(item.award?.trim()) ||
        Boolean(item.teamName?.trim()) ||
        item.participants.length > 0

      const existed = map.get(groupKey)
      if (!existed) {
        map.set(groupKey, {
          id: item.id,
          title: item.title,
          category: item.category,
          happenedAt: item.happenedAt,
          contestLevel: item.contestLevel,
          standingsCount: hasStanding ? 1 : 0,
        })
      } else if (hasStanding) {
        existed.standingsCount += 1
      }
    }

    return [...map.values()].sort((a, b) => {
      const aTime = a.happenedAt ? Date.parse(a.happenedAt) : 0
      const bTime = b.happenedAt ? Date.parse(b.happenedAt) : 0
      return bTime - aTime
    })
  }, [competitions])

  function clearMsg() {
    setError(null)
    setSuccess(null)
  }

  async function loadData() {
    const cachedMembers = peekMembers()
    if (cachedMembers) {
      setMembers(cachedMembers)
    }

    const cachedCompetitions = peekCohortOverview()
    if (cachedCompetitions) {
      setCompetitions(cachedCompetitions)
    }

    setLoadingData(true)
    try {
      const [memberList, competitionList] = await Promise.all([
        fetchMembers(),
        fetchCohortOverview(),
      ])
      setMembers(memberList)
      setCompetitions(competitionList)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载后台数据失败')
    } finally {
      setLoadingData(false)
    }
  }

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setChecking(false)
      return
    }

    async function boot() {
      try {
        const result = await getAdminSessionWithProfile()
        const allowed = Boolean(result.session && result.profile?.isAdmin)
        setIsAdmin(allowed)
        setAdminName(result.profile?.displayName || result.session?.user.email || '')
        if (allowed) {
          await loadData()
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '权限校验失败')
      } finally {
        setChecking(false)
      }
    }

    void boot()
  }, [])

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    clearMsg()
    setSubmitting(true)
    try {
      const result = await signInAsAdmin(email.trim(), password)
      setIsAdmin(true)
      setAdminName(result.profile.displayName || email)
      setEmail('')
      setPassword('')
      await loadData()
      setSuccess('登录成功')
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLogout() {
    clearMsg()
    setSubmitting(true)
    try {
      await signOutAdmin()
      setIsAdmin(false)
      setAdminName('')
      setMembers([])
      setCompetitions([])
      setEditingMemberId(null)
      setSuccess('已退出登录')
    } catch (e) {
      setError(e instanceof Error ? e.message : '退出失败')
    } finally {
      setSubmitting(false)
    }
  }

  async function submitCreateMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    clearMsg()
    setSubmitting(true)
    try {
      await createMember(toMemberDraft(memberForm))
      setMemberForm(initialMemberForm)
      await loadData()
      setSuccess('队员创建成功')
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建队员失败')
    } finally {
      setSubmitting(false)
    }
  }

  async function submitCreateCompetition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    clearMsg()
    setSubmitting(true)
    try {
      await createCompetition(toCompetitionDraft(competitionForm))
      setCompetitionForm(initialCompetitionForm)
      await loadData()
      setSuccess('比赛创建成功')
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建比赛失败')
    } finally {
      setSubmitting(false)
    }
  }

  async function submitUpdateMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingMemberId) return
    clearMsg()
    setSubmitting(true)
    try {
      await updateMember(editingMemberId, toMemberDraft(editMemberForm))
      setEditingMemberId(null)
      await loadData()
      setSuccess('队员更新成功')
    } catch (e) {
      setError(e instanceof Error ? e.message : '更新队员失败')
    } finally {
      setSubmitting(false)
    }
  }

  async function onDeleteMember(member: Member) {
    if (!window.confirm(`确定删除队员「${member.name}」吗？`)) return
    clearMsg()
    setSubmitting(true)
    try {
      await deleteMember(member.id)
      if (editingMemberId === member.id) setEditingMemberId(null)
      await loadData()
      setSuccess('队员删除成功')
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除队员失败')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isSupabaseConfigured) {
    return (
      <section className="panel">
        <h2>管理员后台</h2>
        <p className="status status-error">未配置 Supabase，请先填写 .env.local。</p>
      </section>
    )
  }

  if (checking) {
    return (
      <section className="panel">
        <h2>管理员后台</h2>
        <p className="status">正在检查登录状态...</p>
      </section>
    )
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-header">
          <h2>管理员后台</h2>
          {isAdmin ? <p>当前管理员：{adminName}</p> : <p>请使用管理员账号登录。</p>}
        </div>
        {error ? <p className="status status-error">{error}</p> : null}
        {success ? <p className="status status-success">{success}</p> : null}

        {!isAdmin ? (
          <form className="form-grid" onSubmit={handleLogin}>
            <label>
              邮箱
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              密码
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <button className="btn btn-solid" disabled={submitting}>
              {submitting ? '登录中...' : '登录'}
            </button>
          </form>
        ) : (
          <div className="hero-actions">
            <button className="btn" type="button" onClick={handleLogout} disabled={submitting}>
              退出登录
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => void loadData()}
              disabled={loadingData || submitting}
            >
              {loadingData ? '刷新中...' : '刷新数据'}
            </button>
          </div>
        )}
      </section>

      {isAdmin ? (
        <>
          <section className="panel">
            <div className="panel-header">
              <h3>新增队员</h3>
            </div>
            <form className="form-grid" onSubmit={submitCreateMember}>
              <label>
                姓名
                <input
                  value={memberForm.name}
                  onChange={(e) => setMemberForm((p) => ({ ...p, name: e.target.value }))}
                  required
                />
              </label>
              <label>
                届别
                <input
                  type="number"
                  value={memberForm.cohortYear}
                  onChange={(e) => setMemberForm((p) => ({ ...p, cohortYear: e.target.value }))}
                  required
                />
              </label>
              <label>
                handle
                <input
                  value={memberForm.handle}
                  onChange={(e) => setMemberForm((p) => ({ ...p, handle: e.target.value }))}
                />
              </label>
              <label>
                专业
                <input
                  value={memberForm.major}
                  onChange={(e) => setMemberForm((p) => ({ ...p, major: e.target.value }))}
                />
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={memberForm.isActive}
                  onChange={(e) => setMemberForm((p) => ({ ...p, isActive: e.target.checked }))}
                />
                是否在队
              </label>
              <button className="btn btn-solid" disabled={submitting}>
                {submitting ? '提交中...' : '创建队员'}
              </button>
            </form>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h3>新增比赛</h3>
              <p>
                先创建比赛基础信息，再进入比赛详情页新增或编辑该比赛下的战绩。
              </p>
            </div>
            <form className="form-grid" onSubmit={submitCreateCompetition}>
              <label>
                赛事名称
                <input
                  value={competitionForm.title}
                  onChange={(e) => setCompetitionForm((p) => ({ ...p, title: e.target.value }))}
                  required
                />
              </label>
              <label>
                赛事分类
                <select
                  value={competitionForm.category}
                  onChange={(e) =>
                    setCompetitionForm((p) => ({
                      ...p,
                      category: e.target.value as ContestCategory,
                    }))
                  }
                >
                  {CONTEST_TYPE_ORDER.map((type) => (
                    <option key={type} value={type}>
                      {CONTEST_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                赛季年份
                <input
                  type="number"
                  value={competitionForm.seasonYear}
                  onChange={(e) =>
                    setCompetitionForm((p) => ({ ...p, seasonYear: e.target.value }))
                  }
                  required
                />
              </label>
              <label>
                比赛级别
                <input
                  value={competitionForm.contestLevel}
                  onChange={(e) =>
                    setCompetitionForm((p) => ({ ...p, contestLevel: e.target.value }))
                  }
                  placeholder="如：国赛 / 省赛 / 校赛"
                />
              </label>
              <label>
                日期
                <input
                  type="date"
                  value={competitionForm.happenedAt}
                  onChange={(e) =>
                    setCompetitionForm((p) => ({ ...p, happenedAt: e.target.value }))
                  }
                />
              </label>
              <label className="full-width">
                备注
                <textarea
                  rows={2}
                  value={competitionForm.remark}
                  onChange={(e) => setCompetitionForm((p) => ({ ...p, remark: e.target.value }))}
                />
              </label>
              <button className="btn btn-solid" disabled={submitting}>
                {submitting ? '提交中...' : '创建比赛'}
              </button>
            </form>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h3>队员列表 / 编辑</h3>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>姓名</th>
                    <th>届别</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.id}>
                      <td>{member.name}</td>
                      <td>{member.cohortYear} 级</td>
                      <td>{member.isActive ? '在队' : '退队/毕业'}</td>
                      <td>
                        <div className="action-row">
                          <button
                            type="button"
                            className="btn btn-small"
                            onClick={() => {
                              setEditingMemberId(member.id)
                              setEditMemberForm({
                                name: member.name,
                                handle: member.handle ?? '',
                                cohortYear: String(member.cohortYear),
                                major: member.major ?? '',
                                isActive: member.isActive,
                              })
                            }}
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            className="btn btn-small btn-danger"
                            onClick={() => void onDeleteMember(member)}
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {editingMemberId ? (
              <form className="form-grid inline-wrap" onSubmit={submitUpdateMember}>
                <h4 className="full-width">编辑队员</h4>
                <label>
                  姓名
                  <input
                    value={editMemberForm.name}
                    onChange={(e) => setEditMemberForm((p) => ({ ...p, name: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  届别
                  <input
                    type="number"
                    value={editMemberForm.cohortYear}
                    onChange={(e) =>
                      setEditMemberForm((p) => ({ ...p, cohortYear: e.target.value }))
                    }
                    required
                  />
                </label>
                <label>
                  handle
                  <input
                    value={editMemberForm.handle}
                    onChange={(e) =>
                      setEditMemberForm((p) => ({ ...p, handle: e.target.value }))
                    }
                  />
                </label>
                <label>
                  专业
                  <input
                    value={editMemberForm.major}
                    onChange={(e) => setEditMemberForm((p) => ({ ...p, major: e.target.value }))}
                  />
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={editMemberForm.isActive}
                    onChange={(e) =>
                      setEditMemberForm((p) => ({ ...p, isActive: e.target.checked }))
                    }
                  />
                  是否在队
                </label>
                <div className="action-row full-width">
                  <button className="btn btn-solid" disabled={submitting}>
                    更新队员
                  </button>
                  <button className="btn" type="button" onClick={() => setEditingMemberId(null)}>
                    取消
                  </button>
                </div>
              </form>
            ) : null}
          </section>

          <section className="panel">
            <div className="panel-header">
              <h3>比赛列表</h3>
              <p>点击“管理战绩”进入比赛详情页，再新增/编辑该比赛下的队伍和奖项。</p>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>赛事</th>
                    <th>分类</th>
                    <th>日期</th>
                    <th>比赛级别</th>
                    <th>战绩条数</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {competitionGroups.map((competition) => (
                    <tr key={competition.id}>
                      <td>{competition.title}</td>
                      <td>
                        <ContestTypeTag category={competition.category} />
                      </td>
                      <td>{competition.happenedAt ?? '-'}</td>
                      <td>{competition.contestLevel ?? '-'}</td>
                      <td>{competition.standingsCount}</td>
                      <td>
                        <div className="action-row">
                          <Link
                            to={`/competition/${competition.id}`}
                            className="btn btn-small"
                          >
                            管理战绩
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="todo-note">
              TODO: 后台待补充批量导入、同一比赛多队伍批量录入、比赛主档案与战绩拆表、图片上传、证书附件。
            </p>
          </section>
        </>
      ) : null}
    </div>
  )
}
