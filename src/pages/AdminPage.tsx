import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { ContestTypeTag } from '../components/ContestTypeTag'
import {
  createCompetition,
  createMember,
  fetchMembers,
  getAdminSessionWithProfile,
  signInAsAdmin,
  signOutAdmin,
} from '../lib/api'
import { CONTEST_TYPE_LABELS, CONTEST_TYPE_ORDER } from '../lib/constants'
import { isSupabaseConfigured } from '../lib/supabase'
import type { ContestCategory, Member } from '../types'

interface LoginForm {
  email: string
  password: string
}

interface MemberForm {
  name: string
  handle: string
  cohortYear: string
  className: string
  major: string
  joinedTeamYear: string
  isActive: boolean
  bio: string
}

interface CompetitionForm {
  title: string
  category: ContestCategory
  seasonYear: string
  cohortYear: string
  contestLevel: string
  award: string
  rank: string
  teamName: string
  happenedAt: string
  remark: string
}

const initialMemberForm: MemberForm = {
  name: '',
  handle: '',
  cohortYear: '',
  className: '',
  major: '',
  joinedTeamYear: '',
  isActive: true,
  bio: '',
}

const initialCompetitionForm: CompetitionForm = {
  title: '',
  category: 'freshman',
  seasonYear: '',
  cohortYear: '',
  contestLevel: '',
  award: '',
  rank: '',
  teamName: '',
  happenedAt: '',
  remark: '',
}

export function AdminPage() {
  const [checking, setChecking] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminName, setAdminName] = useState<string>('')
  const [loginForm, setLoginForm] = useState<LoginForm>({
    email: '',
    password: '',
  })

  const [members, setMembers] = useState<Member[]>([])
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])

  const [memberForm, setMemberForm] = useState<MemberForm>(initialMemberForm)
  const [competitionForm, setCompetitionForm] = useState<CompetitionForm>(
    initialCompetitionForm,
  )

  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setChecking(false)
      return
    }

    async function bootstrapAuth() {
      setChecking(true)
      setError(null)

      try {
        const result = await getAdminSessionWithProfile()
        setIsAdmin(Boolean(result.session && result.profile?.isAdmin))
        setAdminName(
          result.profile?.displayName || result.session?.user.email || '',
        )

        if (result.session && result.profile?.isAdmin) {
          const list = await fetchMembers()
          setMembers(list)
        }
      } catch (authError) {
        setError(authError instanceof Error ? authError.message : '权限校验失败')
        setIsAdmin(false)
        setAdminName('')
      } finally {
        setChecking(false)
      }
    }

    void bootstrapAuth()
  }, [])

  async function loadMembers() {
    const list = await fetchMembers()
    setMembers(list)
  }

  const memberOptions = useMemo(
    () =>
      members.map((member) => ({
        id: member.id,
        label: `${member.name} (${member.cohortYear}级)`,
      })),
    [members],
  )

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const result = await signInAsAdmin(
        loginForm.email.trim(),
        loginForm.password,
      )
      setIsAdmin(true)
      setAdminName(result.profile.displayName || loginForm.email)
      setLoginForm({ email: '', password: '' })
      await loadMembers()
      setSuccessMessage('管理员登录成功。')
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : '登录失败')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLogout() {
    setSubmitting(true)
    setError(null)
    setSuccessMessage(null)

    try {
      await signOutAdmin()
      setIsAdmin(false)
      setAdminName('')
      setMembers([])
      setSelectedMemberIds([])
      setSuccessMessage('已退出管理员登录。')
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : '退出失败')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCreateMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!memberForm.name.trim() || !memberForm.cohortYear.trim()) {
      setError('请填写队员姓名和届别。')
      return
    }

    setSubmitting(true)
    setError(null)
    setSuccessMessage(null)

    try {
      await createMember({
        name: memberForm.name,
        handle: memberForm.handle,
        cohortYear: Number(memberForm.cohortYear),
        className: memberForm.className,
        major: memberForm.major,
        joinedTeamYear: memberForm.joinedTeamYear
          ? Number(memberForm.joinedTeamYear)
          : undefined,
        isActive: memberForm.isActive,
        bio: memberForm.bio,
      })

      setMemberForm(initialMemberForm)
      await loadMembers()
      setSuccessMessage('队员创建成功。')
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '创建队员失败')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCreateCompetition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!competitionForm.title.trim() || !competitionForm.seasonYear.trim()) {
      setError('请填写赛事名称和赛季年份。')
      return
    }

    setSubmitting(true)
    setError(null)
    setSuccessMessage(null)

    try {
      await createCompetition({
        title: competitionForm.title,
        category: competitionForm.category,
        seasonYear: Number(competitionForm.seasonYear),
        cohortYear: competitionForm.cohortYear
          ? Number(competitionForm.cohortYear)
          : undefined,
        contestLevel: competitionForm.contestLevel,
        award: competitionForm.award,
        rank: competitionForm.rank,
        teamName: competitionForm.teamName,
        happenedAt: competitionForm.happenedAt,
        remark: competitionForm.remark,
        memberIds: selectedMemberIds,
      })

      setCompetitionForm(initialCompetitionForm)
      setSelectedMemberIds([])
      setSuccessMessage('赛事创建成功。')
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '创建赛事失败')
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
          {isAdmin ? (
            <p>当前管理员: {adminName}</p>
          ) : (
            <p>请使用 Supabase Auth 管理员账号登录。</p>
          )}
        </div>

        {error ? <p className="status status-error">{error}</p> : null}
        {successMessage ? (
          <p className="status status-success">{successMessage}</p>
        ) : null}

        {!isAdmin ? (
          <form className="form-grid" onSubmit={handleLogin}>
            <label>
              邮箱
              <input
                type="email"
                value={loginForm.email}
                onChange={(event) =>
                  setLoginForm((prev) => ({ ...prev, email: event.target.value }))
                }
                required
              />
            </label>
            <label>
              密码
              <input
                type="password"
                value={loginForm.password}
                onChange={(event) =>
                  setLoginForm((prev) => ({
                    ...prev,
                    password: event.target.value,
                  }))
                }
                required
              />
            </label>
            <button className="btn btn-solid" type="submit" disabled={submitting}>
              {submitting ? '登录中...' : '管理员登录'}
            </button>
          </form>
        ) : (
          <button
            className="btn"
            type="button"
            onClick={handleLogout}
            disabled={submitting}
          >
            退出登录
          </button>
        )}
      </section>

      {isAdmin ? (
        <>
          <section className="panel">
            <div className="panel-header">
              <h3>新增队员</h3>
            </div>
            <form className="form-grid" onSubmit={handleCreateMember}>
              <label>
                姓名
                <input
                  value={memberForm.name}
                  onChange={(event) =>
                    setMemberForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  required
                />
              </label>
              <label>
                届别
                <input
                  type="number"
                  value={memberForm.cohortYear}
                  onChange={(event) =>
                    setMemberForm((prev) => ({
                      ...prev,
                      cohortYear: event.target.value,
                    }))
                  }
                  placeholder="例如 2024"
                  required
                />
              </label>
              <label>
                handle
                <input
                  value={memberForm.handle}
                  onChange={(event) =>
                    setMemberForm((prev) => ({
                      ...prev,
                      handle: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                班级
                <input
                  value={memberForm.className}
                  onChange={(event) =>
                    setMemberForm((prev) => ({
                      ...prev,
                      className: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                专业
                <input
                  value={memberForm.major}
                  onChange={(event) =>
                    setMemberForm((prev) => ({ ...prev, major: event.target.value }))
                  }
                />
              </label>
              <label>
                入队年份
                <input
                  type="number"
                  value={memberForm.joinedTeamYear}
                  onChange={(event) =>
                    setMemberForm((prev) => ({
                      ...prev,
                      joinedTeamYear: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={memberForm.isActive}
                  onChange={(event) =>
                    setMemberForm((prev) => ({
                      ...prev,
                      isActive: event.target.checked,
                    }))
                  }
                />
                是否在队
              </label>
              <label className="full-width">
                简介
                <textarea
                  rows={3}
                  value={memberForm.bio}
                  onChange={(event) =>
                    setMemberForm((prev) => ({ ...prev, bio: event.target.value }))
                  }
                />
              </label>
              <button className="btn btn-solid" type="submit" disabled={submitting}>
                {submitting ? '提交中...' : '创建队员'}
              </button>
            </form>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h3>新增赛事记录</h3>
            </div>
            <form className="form-grid" onSubmit={handleCreateCompetition}>
              <label>
                赛事名称
                <input
                  value={competitionForm.title}
                  onChange={(event) =>
                    setCompetitionForm((prev) => ({
                      ...prev,
                      title: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label>
                赛事分类
                <select
                  value={competitionForm.category}
                  onChange={(event) =>
                    setCompetitionForm((prev) => ({
                      ...prev,
                      category: event.target.value as ContestCategory,
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
                  onChange={(event) =>
                    setCompetitionForm((prev) => ({
                      ...prev,
                      seasonYear: event.target.value,
                    }))
                  }
                  placeholder="例如 2025"
                  required
                />
              </label>
              <label>
                对应届别
                <input
                  type="number"
                  value={competitionForm.cohortYear}
                  onChange={(event) =>
                    setCompetitionForm((prev) => ({
                      ...prev,
                      cohortYear: event.target.value,
                    }))
                  }
                  placeholder="例如 2024"
                />
              </label>
              <label>
                赛事级别
                <input
                  value={competitionForm.contestLevel}
                  onChange={(event) =>
                    setCompetitionForm((prev) => ({
                      ...prev,
                      contestLevel: event.target.value,
                    }))
                  }
                  placeholder="省赛/区域赛/国赛"
                />
              </label>
              <label>
                奖项
                <input
                  value={competitionForm.award}
                  onChange={(event) =>
                    setCompetitionForm((prev) => ({
                      ...prev,
                      award: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                名次
                <input
                  value={competitionForm.rank}
                  onChange={(event) =>
                    setCompetitionForm((prev) => ({
                      ...prev,
                      rank: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                队伍名
                <input
                  value={competitionForm.teamName}
                  onChange={(event) =>
                    setCompetitionForm((prev) => ({
                      ...prev,
                      teamName: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                比赛日期
                <input
                  type="date"
                  value={competitionForm.happenedAt}
                  onChange={(event) =>
                    setCompetitionForm((prev) => ({
                      ...prev,
                      happenedAt: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="full-width">
                备注
                <textarea
                  rows={3}
                  value={competitionForm.remark}
                  onChange={(event) =>
                    setCompetitionForm((prev) => ({
                      ...prev,
                      remark: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="full-width">
                关联队员（可多选）
                <select
                  multiple
                  value={selectedMemberIds}
                  onChange={(event) => {
                    const selected = Array.from(event.target.selectedOptions).map(
                      (option) => option.value,
                    )
                    setSelectedMemberIds(selected)
                  }}
                  size={Math.min(10, Math.max(4, memberOptions.length))}
                >
                  {memberOptions.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.label}
                    </option>
                  ))}
                </select>
              </label>

              <button className="btn btn-solid" type="submit" disabled={submitting}>
                {submitting ? '提交中...' : '创建赛事'}
              </button>
            </form>

            <div className="inline-wrap">
              {competitionForm.category ? (
                <p>
                  当前分类预览: <ContestTypeTag category={competitionForm.category} />
                </p>
              ) : null}
            </div>

            <p className="todo-note">
              TODO: 管理后台暂未实现编辑/删除、批量导入、图片证书上传。
            </p>
          </section>
        </>
      ) : null}
    </div>
  )
}
