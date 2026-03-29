import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ContestTypeTag } from '../components/ContestTypeTag'
import {
  createCompetition,
  createMember,
  deleteCompetition,
  deleteMember,
  fetchCohortOverview,
  fetchMembers,
  getAdminSessionWithProfile,
  peekCohortOverview,
  peekMembers,
  signInAsAdmin,
  signOutAdmin,
  updateCompetition,
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
  cohortYear: string
  contestLevel: string
  teamName: string
  rank: string
  award: string
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
  cohortYear: '',
  contestLevel: '',
  teamName: '',
  rank: '',
  award: '',
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

function toCompetitionDraft(
  form: CompetitionForm,
  memberIds: string[],
): CompetitionDraft {
  const seasonYear = Number(form.seasonYear)
  if (!form.title.trim() || !Number.isFinite(seasonYear) || seasonYear <= 0) {
    throw new Error('请填写正确的赛事名称和赛季年份')
  }

  const cohortYear = form.cohortYear ? Number(form.cohortYear) : undefined
  if (form.cohortYear && (!Number.isFinite(cohortYear) || (cohortYear ?? 0) <= 0)) {
    throw new Error('届别格式不正确')
  }

  const uniqueMemberIds = [...new Set(memberIds)]
  if (uniqueMemberIds.length === 0) {
    throw new Error('请至少关联 1 名队员')
  }

  if (!form.award.trim() && !form.rank.trim()) {
    throw new Error('请至少填写奖项或名次')
  }

  return {
    title: form.title.trim(),
    category: form.category,
    seasonYear,
    cohortYear,
    contestLevel: form.contestLevel.trim() || undefined,
    teamName: form.teamName.trim() || undefined,
    award: form.award.trim() || undefined,
    rank: form.rank.trim() || undefined,
    happenedAt: form.happenedAt || undefined,
    remark: form.remark.trim() || undefined,
    memberIds: uniqueMemberIds,
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
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])

  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  const [editMemberForm, setEditMemberForm] = useState<MemberForm>(initialMemberForm)

  const [editingCompetitionId, setEditingCompetitionId] = useState<string | null>(null)
  const [editCompetitionForm, setEditCompetitionForm] =
    useState<CompetitionForm>(initialCompetitionForm)
  const [editCompetitionMemberIds, setEditCompetitionMemberIds] = useState<string[]>([])

  const memberOptions = useMemo(
    () => members.map((m) => ({ id: m.id, label: `${m.name} (${m.cohortYear}级)` })),
    [members],
  )

  function clearMsg() {
    setError(null)
    setSuccess(null)
  }

  function toggleSelectedMember(
    current: string[],
    memberId: string,
    checked: boolean,
  ) {
    if (checked) {
      return current.includes(memberId) ? current : [...current, memberId]
    }

    return current.filter((id) => id !== memberId)
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
      setEditingCompetitionId(null)
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
      await createCompetition(toCompetitionDraft(competitionForm, selectedMemberIds))
      setCompetitionForm(initialCompetitionForm)
      setSelectedMemberIds([])
      await loadData()
      setSuccess('比赛战绩创建成功')
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建比赛战绩失败')
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

  async function submitUpdateCompetition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingCompetitionId) return
    clearMsg()
    setSubmitting(true)
    try {
      await updateCompetition(
        editingCompetitionId,
        toCompetitionDraft(editCompetitionForm, editCompetitionMemberIds),
      )
      setEditingCompetitionId(null)
      await loadData()
      setSuccess('比赛战绩更新成功')
    } catch (e) {
      setError(e instanceof Error ? e.message : '更新比赛战绩失败')
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

  async function onDeleteCompetition(competition: Competition) {
    if (!window.confirm(`确定删除比赛战绩「${competition.title}」吗？`)) return
    clearMsg()
    setSubmitting(true)
    try {
      await deleteCompetition(competition.id)
      if (editingCompetitionId === competition.id) setEditingCompetitionId(null)
      await loadData()
      setSuccess('比赛战绩删除成功')
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除比赛战绩失败')
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
              <h3>新增比赛战绩</h3>
              <p>
                说明：同一场比赛可录入多条战绩（不同队伍/奖项），前台比赛详情页会自动聚合展示。
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
                对应届别
                <input
                  type="number"
                  value={competitionForm.cohortYear}
                  onChange={(e) =>
                    setCompetitionForm((p) => ({ ...p, cohortYear: e.target.value }))
                  }
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
                队伍名称
                <input
                  value={competitionForm.teamName}
                  onChange={(e) =>
                    setCompetitionForm((p) => ({ ...p, teamName: e.target.value }))
                  }
                  placeholder="如：GUACM-1"
                />
              </label>
              <label>
                名次
                <input
                  value={competitionForm.rank}
                  onChange={(e) =>
                    setCompetitionForm((p) => ({ ...p, rank: e.target.value }))
                  }
                  placeholder="如：42 / 银牌第 18"
                />
              </label>
              <label>
                奖项（与名次至少填一项）
                <input
                  value={competitionForm.award}
                  onChange={(e) => setCompetitionForm((p) => ({ ...p, award: e.target.value }))}
                  placeholder="如：金奖 / 银奖 / 一等奖"
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
              <div className="full-width member-picker">
                <p>关联队员（至少 1 人）</p>
                {memberOptions.length === 0 ? (
                  <p className="status-hint">暂无队员，请先在上方创建队员。</p>
                ) : (
                  <div className="member-picker-grid">
                    {memberOptions.map((member) => (
                      <label key={member.id} className="member-picker-item">
                        <input
                          type="checkbox"
                          checked={selectedMemberIds.includes(member.id)}
                          onChange={(event) =>
                            setSelectedMemberIds((current) =>
                              toggleSelectedMember(
                                current,
                                member.id,
                                event.target.checked,
                              ),
                            )
                          }
                        />
                        <span>{member.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <button className="btn btn-solid" disabled={submitting}>
                {submitting ? '提交中...' : '创建比赛战绩'}
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
              <h3>比赛战绩列表 / 编辑</h3>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>赛事</th>
                    <th>分类</th>
                    <th>赛季</th>
                    <th>队伍/名次</th>
                    <th>奖项</th>
                    <th>参赛队员</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {competitions.map((competition) => (
                    <tr key={competition.id}>
                      <td>{competition.title}</td>
                      <td>
                        <ContestTypeTag category={competition.category} />
                      </td>
                      <td>{competition.seasonYear}</td>
                      <td>
                        {competition.teamName ?? '-'}
                        {competition.rank ? ` / ${competition.rank}` : ''}
                      </td>
                      <td>{competition.award ?? '-'}</td>
                      <td>
                        {competition.participants.length
                          ? competition.participants.map((m) => m.name).join('、')
                          : '-'}
                      </td>
                      <td>
                        <div className="action-row">
                          <Link
                            to={`/competition/${competition.id}`}
                            className="btn btn-small"
                          >
                            查看
                          </Link>
                          <button
                            type="button"
                            className="btn btn-small"
                            onClick={() => {
                              setEditingCompetitionId(competition.id)
                              setEditCompetitionForm({
                                title: competition.title,
                                category: competition.category,
                                seasonYear: String(competition.seasonYear),
                                cohortYear: competition.cohortYear
                                  ? String(competition.cohortYear)
                                  : '',
                                contestLevel: competition.contestLevel ?? '',
                                teamName: competition.teamName ?? '',
                                rank: competition.rank ?? '',
                                award: competition.award ?? '',
                                happenedAt: competition.happenedAt ?? '',
                                remark: competition.remark ?? '',
                              })
                              setEditCompetitionMemberIds(
                                competition.participants.map((member) => member.id),
                              )
                            }}
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            className="btn btn-small btn-danger"
                            onClick={() => void onDeleteCompetition(competition)}
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

            {editingCompetitionId ? (
              <form className="form-grid inline-wrap" onSubmit={submitUpdateCompetition}>
                <h4 className="full-width">编辑比赛战绩</h4>
                <label>
                  赛事名称
                  <input
                    value={editCompetitionForm.title}
                    onChange={(e) =>
                      setEditCompetitionForm((p) => ({ ...p, title: e.target.value }))
                    }
                    required
                  />
                </label>
                <label>
                  赛事分类
                  <select
                    value={editCompetitionForm.category}
                    onChange={(e) =>
                      setEditCompetitionForm((p) => ({
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
                    value={editCompetitionForm.seasonYear}
                    onChange={(e) =>
                      setEditCompetitionForm((p) => ({ ...p, seasonYear: e.target.value }))
                    }
                    required
                  />
                </label>
                <label>
                  对应届别
                  <input
                    type="number"
                    value={editCompetitionForm.cohortYear}
                    onChange={(e) =>
                      setEditCompetitionForm((p) => ({ ...p, cohortYear: e.target.value }))
                    }
                  />
                </label>
                <label>
                  比赛级别
                  <input
                    value={editCompetitionForm.contestLevel}
                    onChange={(e) =>
                      setEditCompetitionForm((p) => ({ ...p, contestLevel: e.target.value }))
                    }
                    placeholder="如：国赛 / 省赛 / 校赛"
                  />
                </label>
                <label>
                  队伍名称
                  <input
                    value={editCompetitionForm.teamName}
                    onChange={(e) =>
                      setEditCompetitionForm((p) => ({ ...p, teamName: e.target.value }))
                    }
                    placeholder="如：GUACM-1"
                  />
                </label>
                <label>
                  名次
                  <input
                    value={editCompetitionForm.rank}
                    onChange={(e) =>
                      setEditCompetitionForm((p) => ({ ...p, rank: e.target.value }))
                    }
                    placeholder="如：42 / 银牌第 18"
                  />
                </label>
                <label>
                  奖项（与名次至少填一项）
                  <input
                    value={editCompetitionForm.award}
                    onChange={(e) =>
                      setEditCompetitionForm((p) => ({ ...p, award: e.target.value }))
                    }
                    placeholder="如：金奖 / 银奖 / 一等奖"
                  />
                </label>
                <label>
                  日期
                  <input
                    type="date"
                    value={editCompetitionForm.happenedAt}
                    onChange={(e) =>
                      setEditCompetitionForm((p) => ({ ...p, happenedAt: e.target.value }))
                    }
                  />
                </label>
                <label className="full-width">
                  备注
                  <textarea
                    rows={2}
                    value={editCompetitionForm.remark}
                    onChange={(e) =>
                      setEditCompetitionForm((p) => ({ ...p, remark: e.target.value }))
                    }
                  />
                </label>
                <div className="full-width member-picker">
                  <p>关联队员（至少 1 人）</p>
                  {memberOptions.length === 0 ? (
                    <p className="status-hint">暂无队员，请先在上方创建队员。</p>
                  ) : (
                    <div className="member-picker-grid">
                      {memberOptions.map((member) => (
                        <label key={member.id} className="member-picker-item">
                          <input
                            type="checkbox"
                            checked={editCompetitionMemberIds.includes(member.id)}
                            onChange={(event) =>
                              setEditCompetitionMemberIds((current) =>
                                toggleSelectedMember(
                                  current,
                                  member.id,
                                  event.target.checked,
                                ),
                              )
                            }
                          />
                          <span>{member.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <div className="action-row full-width">
                  <button className="btn btn-solid" disabled={submitting}>
                    更新比赛战绩
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => setEditingCompetitionId(null)}
                  >
                    取消
                  </button>
                </div>
              </form>
            ) : null}

            <p className="todo-note">
              TODO: 后台待补充批量导入、同一比赛多队伍批量录入、图片上传、证书附件。
            </p>
          </section>
        </>
      ) : null}
    </div>
  )
}
