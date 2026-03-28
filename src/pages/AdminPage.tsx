import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { ContestTypeTag } from '../components/ContestTypeTag'
import {
  createCompetition,
  createMember,
  deleteCompetition,
  deleteMember,
  fetchCohortOverview,
  fetchMembers,
  getAdminSessionWithProfile,
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
  award: '',
  happenedAt: '',
  remark: '',
}

function toMemberDraft(form: MemberForm): MemberDraft {
  const cohortYear = Number(form.cohortYear)
  if (!form.name.trim() || !Number.isFinite(cohortYear) || cohortYear <= 0) {
    throw new Error('?????????????')
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
    throw new Error('???????????????')
  }

  const cohortYear = form.cohortYear ? Number(form.cohortYear) : undefined
  if (form.cohortYear && (!Number.isFinite(cohortYear) || (cohortYear ?? 0) <= 0)) {
    throw new Error('???????')
  }

  return {
    title: form.title.trim(),
    category: form.category,
    seasonYear,
    cohortYear,
    award: form.award.trim() || undefined,
    happenedAt: form.happenedAt || undefined,
    remark: form.remark.trim() || undefined,
    memberIds,
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

  const [members, setMembers] = useState<Member[]>([])
  const [competitions, setCompetitions] = useState<Competition[]>([])

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
    () => members.map((m) => ({ id: m.id, label: `${m.name} (${m.cohortYear}?)` })),
    [members],
  )

  function clearMsg() {
    setError(null)
    setSuccess(null)
  }

  async function loadData() {
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
        setError(e instanceof Error ? e.message : '??????')
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
      setSuccess('????')
    } catch (e) {
      setError(e instanceof Error ? e.message : '????')
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
      setSuccess('?????')
    } catch (e) {
      setError(e instanceof Error ? e.message : '????')
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
      setSuccess('??????')
    } catch (e) {
      setError(e instanceof Error ? e.message : '??????')
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
      setSuccess('??????')
    } catch (e) {
      setError(e instanceof Error ? e.message : '??????')
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
      setSuccess('??????')
    } catch (e) {
      setError(e instanceof Error ? e.message : '??????')
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
      setSuccess('??????')
    } catch (e) {
      setError(e instanceof Error ? e.message : '??????')
    } finally {
      setSubmitting(false)
    }
  }

  async function onDeleteMember(member: Member) {
    if (!window.confirm(`???????${member.name}??`)) return
    clearMsg()
    setSubmitting(true)
    try {
      await deleteMember(member.id)
      if (editingMemberId === member.id) setEditingMemberId(null)
      await loadData()
      setSuccess('?????')
    } catch (e) {
      setError(e instanceof Error ? e.message : '??????')
    } finally {
      setSubmitting(false)
    }
  }

  async function onDeleteCompetition(competition: Competition) {
    if (!window.confirm(`???????${competition.title}??`)) return
    clearMsg()
    setSubmitting(true)
    try {
      await deleteCompetition(competition.id)
      if (editingCompetitionId === competition.id) setEditingCompetitionId(null)
      await loadData()
      setSuccess('?????')
    } catch (e) {
      setError(e instanceof Error ? e.message : '??????')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isSupabaseConfigured) {
    return (
      <section className="panel">
        <h2>?????</h2>
        <p className="status status-error">??? Supabase????? .env.local?</p>
      </section>
    )
  }

  if (checking) {
    return (
      <section className="panel">
        <h2>?????</h2>
        <p className="status">????????...</p>
      </section>
    )
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-header">
          <h2>?????</h2>
          {isAdmin ? <p>??????{adminName}</p> : <p>??????????</p>}
        </div>
        {error ? <p className="status status-error">{error}</p> : null}
        {success ? <p className="status status-success">{success}</p> : null}

        {!isAdmin ? (
          <form className="form-grid" onSubmit={handleLogin}>
            <label>
              ??
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              ??
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <button className="btn btn-solid" disabled={submitting}>
              {submitting ? '???...' : '??'}
            </button>
          </form>
        ) : (
          <div className="hero-actions">
            <button className="btn" type="button" onClick={handleLogout} disabled={submitting}>
              ??
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => void loadData()}
              disabled={loadingData || submitting}
            >
              {loadingData ? '???...' : '????'}
            </button>
          </div>
        )}
      </section>

      {isAdmin ? (
        <>
          <section className="panel">
            <div className="panel-header">
              <h3>????</h3>
            </div>
            <form className="form-grid" onSubmit={submitCreateMember}>
              <label>
                ??
                <input
                  value={memberForm.name}
                  onChange={(e) => setMemberForm((p) => ({ ...p, name: e.target.value }))}
                  required
                />
              </label>
              <label>
                ??
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
                ??
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
                ????
              </label>
              <button className="btn btn-solid" disabled={submitting}>
                {submitting ? '???...' : '????'}
              </button>
            </form>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h3>????</h3>
            </div>
            <form className="form-grid" onSubmit={submitCreateCompetition}>
              <label>
                ????
                <input
                  value={competitionForm.title}
                  onChange={(e) => setCompetitionForm((p) => ({ ...p, title: e.target.value }))}
                  required
                />
              </label>
              <label>
                ??
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
                ????
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
                ????
                <input
                  type="number"
                  value={competitionForm.cohortYear}
                  onChange={(e) =>
                    setCompetitionForm((p) => ({ ...p, cohortYear: e.target.value }))
                  }
                />
              </label>
              <label>
                ??
                <input
                  value={competitionForm.award}
                  onChange={(e) => setCompetitionForm((p) => ({ ...p, award: e.target.value }))}
                />
              </label>
              <label>
                ??
                <input
                  type="date"
                  value={competitionForm.happenedAt}
                  onChange={(e) =>
                    setCompetitionForm((p) => ({ ...p, happenedAt: e.target.value }))
                  }
                />
              </label>
              <label className="full-width">
                ??
                <textarea
                  rows={2}
                  value={competitionForm.remark}
                  onChange={(e) => setCompetitionForm((p) => ({ ...p, remark: e.target.value }))}
                />
              </label>
              <label className="full-width">
                ?????????
                <select
                  multiple
                  value={selectedMemberIds}
                  onChange={(event) =>
                    setSelectedMemberIds(
                      Array.from(event.target.selectedOptions).map((option) => option.value),
                    )
                  }
                  size={Math.min(10, Math.max(4, memberOptions.length))}
                >
                  {memberOptions.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.label}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn btn-solid" disabled={submitting}>
                {submitting ? '???...' : '????'}
              </button>
            </form>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h3>?????? / ??</h3>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>??</th>
                    <th>??</th>
                    <th>??</th>
                    <th>??</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.id}>
                      <td>{member.name}</td>
                      <td>{member.cohortYear} ?</td>
                      <td>{member.isActive ? '??' : '???/??'}</td>
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
                            ??
                          </button>
                          <button
                            type="button"
                            className="btn btn-small btn-danger"
                            onClick={() => void onDeleteMember(member)}
                          >
                            ??
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
                <h4 className="full-width">????</h4>
                <label>
                  ??
                  <input
                    value={editMemberForm.name}
                    onChange={(e) => setEditMemberForm((p) => ({ ...p, name: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  ??
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
                  ??
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
                  ????
                </label>
                <div className="action-row full-width">
                  <button className="btn btn-solid" disabled={submitting}>
                    ????
                  </button>
                  <button className="btn" type="button" onClick={() => setEditingMemberId(null)}>
                    ??
                  </button>
                </div>
              </form>
            ) : null}
          </section>

          <section className="panel">
            <div className="panel-header">
              <h3>?????? / ??</h3>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>??</th>
                    <th>??</th>
                    <th>??</th>
                    <th>??</th>
                    <th>??</th>
                    <th>??</th>
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
                      <td>{competition.award ?? '-'}</td>
                      <td>
                        {competition.participants.length
                          ? competition.participants.map((m) => m.name).join('?')
                          : '-'}
                      </td>
                      <td>
                        <div className="action-row">
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
                                award: competition.award ?? '',
                                happenedAt: competition.happenedAt ?? '',
                                remark: competition.remark ?? '',
                              })
                              setEditCompetitionMemberIds(
                                competition.participants.map((member) => member.id),
                              )
                            }}
                          >
                            ??
                          </button>
                          <button
                            type="button"
                            className="btn btn-small btn-danger"
                            onClick={() => void onDeleteCompetition(competition)}
                          >
                            ??
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
                <h4 className="full-width">????</h4>
                <label>
                  ????
                  <input
                    value={editCompetitionForm.title}
                    onChange={(e) =>
                      setEditCompetitionForm((p) => ({ ...p, title: e.target.value }))
                    }
                    required
                  />
                </label>
                <label>
                  ??
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
                  ????
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
                  ????
                  <input
                    type="number"
                    value={editCompetitionForm.cohortYear}
                    onChange={(e) =>
                      setEditCompetitionForm((p) => ({ ...p, cohortYear: e.target.value }))
                    }
                  />
                </label>
                <label>
                  ??
                  <input
                    value={editCompetitionForm.award}
                    onChange={(e) =>
                      setEditCompetitionForm((p) => ({ ...p, award: e.target.value }))
                    }
                  />
                </label>
                <label>
                  ??
                  <input
                    type="date"
                    value={editCompetitionForm.happenedAt}
                    onChange={(e) =>
                      setEditCompetitionForm((p) => ({ ...p, happenedAt: e.target.value }))
                    }
                  />
                </label>
                <label className="full-width">
                  ??
                  <textarea
                    rows={2}
                    value={editCompetitionForm.remark}
                    onChange={(e) =>
                      setEditCompetitionForm((p) => ({ ...p, remark: e.target.value }))
                    }
                  />
                </label>
                <label className="full-width">
                  ?????????
                  <select
                    multiple
                    value={editCompetitionMemberIds}
                    onChange={(event) =>
                      setEditCompetitionMemberIds(
                        Array.from(event.target.selectedOptions).map((option) => option.value),
                      )
                    }
                    size={Math.min(10, Math.max(4, memberOptions.length))}
                  >
                    {memberOptions.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="action-row full-width">
                  <button className="btn btn-solid" disabled={submitting}>
                    ????
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => setEditingCompetitionId(null)}
                  >
                    ??
                  </button>
                </div>
              </form>
            ) : null}

            <p className="todo-note">
              TODO: ????????? + ??? + ????????
            </p>
          </section>
        </>
      ) : null}
    </div>
  )
}
