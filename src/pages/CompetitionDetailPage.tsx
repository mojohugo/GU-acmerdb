import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ContestTypeTag } from '../components/ContestTypeTag'
import { EmptyState } from '../components/EmptyState'
import { AwardBadge, RankBadge } from '../components/ResultBadge'
import {
  createCompetition,
  deleteCompetition,
  fetchCompetitionDetail,
  fetchMembers,
  getAdminSessionWithProfile,
  peekCompetitionDetail,
  peekMembers,
  updateCompetition,
} from '../lib/api'
import { isSupabaseConfigured } from '../lib/supabase'
import type { Competition, CompetitionDetail, CompetitionDraft, Member } from '../types'

type StandingForm = {
  teamName: string
  rank: string
  award: string
  remark: string
  memberIds: string[]
}

function createEmptyStandingForm(): StandingForm {
  return {
    teamName: '',
    rank: '',
    award: '',
    remark: '',
    memberIds: [],
  }
}

function toggleMemberIds(current: string[], memberId: string, checked: boolean) {
  if (checked) {
    return current.includes(memberId) ? current : [...current, memberId]
  }

  return current.filter((id) => id !== memberId)
}

function toStandingDraft(focus: Competition, form: StandingForm): CompetitionDraft {
  const memberIds = [...new Set(form.memberIds)]

  if (memberIds.length === 0) {
    throw new Error('请至少选择 1 名参赛队员')
  }

  if (!form.rank.trim() && !form.award.trim()) {
    throw new Error('请至少填写名次或奖项')
  }

  return {
    title: focus.title,
    category: focus.category,
    seasonYear: focus.seasonYear,
    contestLevel: focus.contestLevel ?? undefined,
    happenedAt: focus.happenedAt ?? undefined,
    teamName: form.teamName.trim() || undefined,
    rank: form.rank.trim() || undefined,
    award: form.award.trim() || undefined,
    remark: form.remark.trim() || undefined,
    memberIds,
  }
}

function hasStandingInput(form: StandingForm) {
  return (
    Boolean(form.teamName.trim()) ||
    Boolean(form.rank.trim()) ||
    Boolean(form.award.trim()) ||
    Boolean(form.remark.trim()) ||
    form.memberIds.length > 0
  )
}

export function CompetitionDetailPage() {
  const { competitionId } = useParams()
  const cached = competitionId ? peekCompetitionDetail(competitionId) : null
  const [detail, setDetail] = useState<CompetitionDetail | null>(() => cached)
  const [loading, setLoading] = useState(() => !cached)
  const [error, setError] = useState<string | null>(null)

  const [checkingAdmin, setCheckingAdmin] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [members, setMembers] = useState<Member[]>(() => peekMembers() ?? [])
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [createForms, setCreateForms] = useState<StandingForm[]>(() => [
    createEmptyStandingForm(),
  ])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<StandingForm>(() => createEmptyStandingForm())

  async function reloadDetail(id: string) {
    const latest = await fetchCompetitionDetail(id)
    setDetail(latest)
  }

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

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setCheckingAdmin(false)
      return
    }

    let disposed = false

    async function loadAdminContext() {
      try {
        const session = await getAdminSessionWithProfile()
        if (!disposed) {
          setIsAdmin(Boolean(session.session && session.profile?.isAdmin))
        }

        const cachedMembers = peekMembers()
        if (cachedMembers && !disposed) {
          setMembers(cachedMembers)
        }

        if (session.session && session.profile?.isAdmin) {
          const latestMembers = await fetchMembers()
          if (!disposed) {
            setMembers(latestMembers)
          }
        }
      } catch {
        if (!disposed) {
          setIsAdmin(false)
        }
      } finally {
        if (!disposed) {
          setCheckingAdmin(false)
        }
      }
    }

    void loadAdminContext()

    return () => {
      disposed = true
    }
  }, [])

  function clearActionMessage() {
    setActionError(null)
    setActionSuccess(null)
  }

  function updateCreateForm(
    rowIndex: number,
    updater: (previous: StandingForm) => StandingForm,
  ) {
    setCreateForms((previous) =>
      previous.map((row, index) => (index === rowIndex ? updater(row) : row)),
    )
  }

  function addCreateFormRow() {
    setCreateForms((previous) => [...previous, createEmptyStandingForm()])
  }

  function removeCreateFormRow(rowIndex: number) {
    setCreateForms((previous) => {
      if (previous.length <= 1) {
        return [createEmptyStandingForm()]
      }

      return previous.filter((_, index) => index !== rowIndex)
    })
  }

  async function handleCreateStanding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!competitionId || !detail) return

    clearActionMessage()
    setActionLoading(true)
    try {
      const rowsWithInput = createForms.flatMap((form, index) =>
        hasStandingInput(form) ? [{ form, sourceRowIndex: index }] : [],
      )

      if (rowsWithInput.length === 0) {
        throw new Error('请至少填写 1 条战绩')
      }

      const drafts = rowsWithInput.map((item) => {
        try {
          return toStandingDraft(detail.focus, item.form)
        } catch (draftError) {
          throw new Error(
            `第 ${item.sourceRowIndex + 1} 条：${
              draftError instanceof Error ? draftError.message : '格式错误'
            }`,
          )
        }
      })

      let completedCount = 0
      for (let index = 0; index < drafts.length; index += 1) {
        try {
          await createCompetition(drafts[index])
          completedCount += 1
        } catch (createError) {
          const sourceRowIndex = rowsWithInput[index].sourceRowIndex + 1
          const reason = createError instanceof Error ? createError.message : '新增失败'
          throw new Error(
            completedCount > 0
              ? `前 ${completedCount} 条已成功，第 ${sourceRowIndex} 条失败：${reason}`
              : `第 ${sourceRowIndex} 条提交失败：${reason}`,
          )
        }
      }

      setCreateForms([createEmptyStandingForm()])
      await reloadDetail(competitionId)
      setActionSuccess(
        drafts.length > 1 ? `已批量新增 ${drafts.length} 条战绩` : '战绩新增成功',
      )
    } catch (createError) {
      setActionError(createError instanceof Error ? createError.message : '新增战绩失败')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleUpdateStanding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!competitionId || !detail || !editingId) return

    clearActionMessage()
    setActionLoading(true)
    try {
      await updateCompetition(editingId, toStandingDraft(detail.focus, editForm))
      setEditingId(null)
      setEditForm(createEmptyStandingForm())
      await reloadDetail(competitionId)
      setActionSuccess('战绩更新成功')
    } catch (updateError) {
      setActionError(updateError instanceof Error ? updateError.message : '更新战绩失败')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleDeleteStanding(entry: Competition) {
    if (!competitionId) {
      return
    }

    if (!window.confirm(`确定删除该条战绩吗？`)) {
      return
    }

    clearActionMessage()
    setActionLoading(true)
    try {
      await deleteCompetition(entry.id)
      if (editingId === entry.id) {
        setEditingId(null)
        setEditForm(createEmptyStandingForm())
      }
      await reloadDetail(competitionId)
      setActionSuccess('战绩删除成功')
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : '删除战绩失败')
    } finally {
      setActionLoading(false)
    }
  }

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
              <EmptyState title="暂无战绩记录" description="请先新增该比赛战绩。" />
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
                      {isAdmin ? <th>操作</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.standings.map((entry, index) => (
                      <tr key={entry.id}>
                        <td>{index + 1}</td>
                        <td>{entry.rank ? <RankBadge rank={entry.rank} /> : '-'}</td>
                        <td>{entry.award ? <AwardBadge award={entry.award} /> : '-'}</td>
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
                        {isAdmin ? (
                          <td>
                            <div className="action-row">
                              <button
                                type="button"
                                className="btn btn-small"
                                onClick={() => {
                                  setEditingId(entry.id)
                                  setEditForm({
                                    teamName: entry.teamName ?? '',
                                    rank: entry.rank ?? '',
                                    award: entry.award ?? '',
                                    remark: entry.remark ?? '',
                                    memberIds: entry.participants.map((member) => member.id),
                                  })
                                }}
                              >
                                编辑
                              </button>
                              <button
                                type="button"
                                className="btn btn-small btn-danger"
                                onClick={() => void handleDeleteStanding(entry)}
                                disabled={actionLoading}
                              >
                                删除
                              </button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {isAdmin && !checkingAdmin ? (
            <section className="panel">
              <div className="panel-header">
                <h3>管理比赛战绩（管理员）</h3>
                <p>在这里为当前比赛新增或编辑战绩。</p>
              </div>

              {actionError ? <p className="status status-error">{actionError}</p> : null}
              {actionSuccess ? (
                <p className="status status-success">{actionSuccess}</p>
              ) : null}

              <form className="stack" onSubmit={handleCreateStanding}>
                <div className="standing-form-list">
                  {createForms.map((form, rowIndex) => (
                    <article key={`standing-draft-${rowIndex}`} className="sub-panel standing-form-card">
                      <div className="standing-form-head">
                        <h4>战绩 #{rowIndex + 1}</h4>
                        {createForms.length > 1 ? (
                          <button
                            type="button"
                            className="btn btn-small btn-danger"
                            onClick={() => removeCreateFormRow(rowIndex)}
                            disabled={actionLoading}
                          >
                            删除本条
                          </button>
                        ) : null}
                      </div>

                      <div className="form-grid">
                        <label>
                          队伍名称
                          <input
                            value={form.teamName}
                            onChange={(event) =>
                              updateCreateForm(rowIndex, (previous) => ({
                                ...previous,
                                teamName: event.target.value,
                              }))
                            }
                            placeholder="如：GUACM-1"
                          />
                        </label>
                        <label>
                          名次
                          <input
                            value={form.rank}
                            onChange={(event) =>
                              updateCreateForm(rowIndex, (previous) => ({
                                ...previous,
                                rank: event.target.value,
                              }))
                            }
                            placeholder="如：42 / 银牌第 18"
                          />
                        </label>
                        <label>
                          奖项
                          <input
                            value={form.award}
                            onChange={(event) =>
                              updateCreateForm(rowIndex, (previous) => ({
                                ...previous,
                                award: event.target.value,
                              }))
                            }
                            placeholder="如：金奖 / 银奖 / 一等奖"
                          />
                        </label>
                        <label className="full-width">
                          备注
                          <textarea
                            rows={2}
                            value={form.remark}
                            onChange={(event) =>
                              updateCreateForm(rowIndex, (previous) => ({
                                ...previous,
                                remark: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <div className="full-width member-picker">
                          <p>参赛队员（至少 1 人）</p>
                          {members.length === 0 ? (
                            <p className="status-hint">暂无队员，请先到管理后台创建队员。</p>
                          ) : (
                            <div className="member-picker-grid">
                              {members.map((member) => (
                                <label key={`${rowIndex}-${member.id}`} className="member-picker-item">
                                  <input
                                    type="checkbox"
                                    checked={form.memberIds.includes(member.id)}
                                    onChange={(event) =>
                                      updateCreateForm(rowIndex, (previous) => ({
                                        ...previous,
                                        memberIds: toggleMemberIds(
                                          previous.memberIds,
                                          member.id,
                                          event.target.checked,
                                        ),
                                      }))
                                    }
                                  />
                                  <span>
                                    {member.name}（{member.cohortYear}级）
                                  </span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="action-row">
                  <button
                    className="btn"
                    type="button"
                    onClick={addCreateFormRow}
                    disabled={actionLoading}
                  >
                    新增一条战绩行
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => setCreateForms([createEmptyStandingForm()])}
                    disabled={actionLoading}
                  >
                    清空录入
                  </button>
                  <button className="btn btn-solid" disabled={actionLoading}>
                    {actionLoading
                      ? '提交中...'
                      : createForms.length > 1
                        ? '批量新增战绩'
                        : '新增战绩'}
                  </button>
                </div>
              </form>

              {editingId ? (
                <form className="form-grid inline-wrap" onSubmit={handleUpdateStanding}>
                  <h4 className="full-width">编辑战绩</h4>
                  <label>
                    队伍名称
                    <input
                      value={editForm.teamName}
                      onChange={(event) =>
                        setEditForm((prev) => ({ ...prev, teamName: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    名次
                    <input
                      value={editForm.rank}
                      onChange={(event) =>
                        setEditForm((prev) => ({ ...prev, rank: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    奖项
                    <input
                      value={editForm.award}
                      onChange={(event) =>
                        setEditForm((prev) => ({ ...prev, award: event.target.value }))
                      }
                    />
                  </label>
                  <label className="full-width">
                    备注
                    <textarea
                      rows={2}
                      value={editForm.remark}
                      onChange={(event) =>
                        setEditForm((prev) => ({ ...prev, remark: event.target.value }))
                      }
                    />
                  </label>
                  <div className="full-width member-picker">
                    <p>参赛队员（至少 1 人）</p>
                    {members.length === 0 ? (
                      <p className="status-hint">暂无队员，请先到管理后台创建队员。</p>
                    ) : (
                      <div className="member-picker-grid">
                        {members.map((member) => (
                          <label key={member.id} className="member-picker-item">
                            <input
                              type="checkbox"
                              checked={editForm.memberIds.includes(member.id)}
                              onChange={(event) =>
                                setEditForm((prev) => ({
                                  ...prev,
                                  memberIds: toggleMemberIds(
                                    prev.memberIds,
                                    member.id,
                                    event.target.checked,
                                  ),
                                }))
                              }
                            />
                            <span>
                              {member.name}（{member.cohortYear}级）
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="action-row full-width">
                    <button className="btn btn-solid" disabled={actionLoading}>
                      更新战绩
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setEditingId(null)
                        setEditForm(createEmptyStandingForm())
                      }}
                      disabled={actionLoading}
                    >
                      取消
                    </button>
                  </div>
                </form>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
