import type { ChangeEvent, FormEvent } from 'react'
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
import {
  checkCompetitionImportRows,
  checkMemberImportRows,
  parseCompetitionImportCsv,
  parseMemberImportCsv,
  type ImportWarning,
} from '../lib/batchImport'
import { CONTEST_TYPE_LABELS, CONTEST_TYPE_ORDER } from '../lib/constants'
import { downloadCsv } from '../lib/csv'
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

type CompetitionGroup = {
  key: string
  id: string
  title: string
  category: ContestCategory
  seasonYear: number
  happenedAt: string | null
  contestLevel: string | null
  remark: string | null
  standingsCount: number
  entries: Competition[]
}

type MemberImportPreview = {
  rowCount: number
  warnings: ImportWarning[]
  samples: Array<{
    rowNumber: number
    name: string
    cohortYear: number
    handle?: string
    isActive: boolean
  }>
}

type CompetitionImportPreview = {
  rowCount: number
  warnings: ImportWarning[]
  samples: Array<{
    rowNumber: number
    title: string
    category: ContestCategory
    seasonYear: number
    memberCount: number
    hasStanding: boolean
  }>
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

const ADMIN_PAGE_SIZE_OPTIONS = [10, 20, 50] as const

function getPageCount(total: number, pageSize: number) {
  return total > 0 ? Math.ceil(total / pageSize) : 1
}

function sliceByPage<T>(items: T[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize
  return items.slice(start, start + pageSize)
}

function createDateStamp() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

function downloadMemberImportTemplate() {
  downloadCsv({
    filename: `gu-acmerdb-members-import-template-${createDateStamp()}.csv`,
    headers: ['name', 'cohortYear', 'handle', 'major', 'isActive'],
    rows: [
      ['张三', 2024, 'alice', '计算机科学与技术', 'true'],
      ['李四', 2023, 'bob', '软件工程', 'false'],
    ],
  })
}

function downloadCompetitionImportTemplate() {
  downloadCsv({
    filename: `gu-acmerdb-competitions-import-template-${createDateStamp()}.csv`,
    headers: [
      'title',
      'category',
      'seasonYear',
      'contestLevel',
      'happenedAt',
      'teamName',
      'rank',
      'award',
      'members',
      'remark',
    ],
    rows: [
      [
        'ICPC 昆明站',
        'icpc_regional',
        2025,
        '区域赛',
        '2025-11-15',
        'GUACM-1',
        '第 10 名',
        '银奖',
        'alice;bob',
        '导入示例',
      ],
      [
        '校赛春季赛',
        '校赛',
        2026,
        '校赛',
        '2026-03-10',
        '新生训练队',
        '冠军',
        '一等奖',
        '张三;李四',
        '支持中文分类和中文姓名匹配',
      ],
    ],
  })
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
  const [memberImportText, setMemberImportText] = useState('')
  const [competitionImportText, setCompetitionImportText] = useState('')
  const [memberImportPreview, setMemberImportPreview] = useState<MemberImportPreview | null>(null)
  const [competitionImportPreview, setCompetitionImportPreview] =
    useState<CompetitionImportPreview | null>(null)

  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  const [editMemberForm, setEditMemberForm] = useState<MemberForm>(initialMemberForm)
  const [editingCompetitionKey, setEditingCompetitionKey] = useState<string | null>(null)
  const [editCompetitionForm, setEditCompetitionForm] =
    useState<CompetitionForm>(initialCompetitionForm)

  const [memberPage, setMemberPage] = useState(1)
  const [memberPageSize, setMemberPageSize] = useState<number>(ADMIN_PAGE_SIZE_OPTIONS[1])
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])

  const [competitionPage, setCompetitionPage] = useState(1)
  const [competitionPageSize, setCompetitionPageSize] = useState<number>(
    ADMIN_PAGE_SIZE_OPTIONS[1],
  )
  const [selectedCompetitionKeys, setSelectedCompetitionKeys] = useState<string[]>([])

  const competitionGroups = useMemo(() => {
    const map = new Map<string, CompetitionGroup>()

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
          key: groupKey,
          id: item.id,
          title: item.title,
          category: item.category,
          seasonYear: item.seasonYear,
          happenedAt: item.happenedAt,
          contestLevel: item.contestLevel,
          remark: item.remark,
          standingsCount: hasStanding ? 1 : 0,
          entries: [item],
        })
      } else {
        existed.entries.push(item)
        if (hasStanding) {
          existed.standingsCount += 1
        }
      }
    }

    return [...map.values()].sort((a, b) => {
      const aTime = a.happenedAt ? Date.parse(a.happenedAt) : 0
      const bTime = b.happenedAt ? Date.parse(b.happenedAt) : 0
      if (aTime !== bTime) {
        return bTime - aTime
      }

      return b.seasonYear - a.seasonYear
    })
  }, [competitions])

  const memberPageCount = useMemo(
    () => getPageCount(members.length, memberPageSize),
    [members.length, memberPageSize],
  )

  const pagedMembers = useMemo(
    () => sliceByPage(members, memberPage, memberPageSize),
    [members, memberPage, memberPageSize],
  )

  const competitionPageCount = useMemo(
    () => getPageCount(competitionGroups.length, competitionPageSize),
    [competitionGroups.length, competitionPageSize],
  )

  const pagedCompetitionGroups = useMemo(
    () => sliceByPage(competitionGroups, competitionPage, competitionPageSize),
    [competitionGroups, competitionPage, competitionPageSize],
  )

  const currentPageMemberIds = useMemo(
    () => pagedMembers.map((item) => item.id),
    [pagedMembers],
  )
  const currentPageCompetitionKeys = useMemo(
    () => pagedCompetitionGroups.map((item) => item.key),
    [pagedCompetitionGroups],
  )

  const allCurrentMembersSelected =
    currentPageMemberIds.length > 0 &&
    currentPageMemberIds.every((id) => selectedMemberIds.includes(id))
  const allCurrentCompetitionsSelected =
    currentPageCompetitionKeys.length > 0 &&
    currentPageCompetitionKeys.every((key) => selectedCompetitionKeys.includes(key))

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

  useEffect(() => {
    setSelectedMemberIds((previous) =>
      previous.filter((id) => members.some((member) => member.id === id)),
    )
    setMemberPage((previous) => Math.min(Math.max(1, previous), memberPageCount))
  }, [memberPageCount, members])

  useEffect(() => {
    setSelectedCompetitionKeys((previous) =>
      previous.filter((key) => competitionGroups.some((group) => group.key === key)),
    )
    setCompetitionPage((previous) => Math.min(Math.max(1, previous), competitionPageCount))
  }, [competitionGroups, competitionPageCount])

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
      setEditingCompetitionKey(null)
      setSelectedMemberIds([])
      setSelectedCompetitionKeys([])
      setMemberPage(1)
      setCompetitionPage(1)
      setMemberImportPreview(null)
      setCompetitionImportPreview(null)
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

  async function fillImportTextFromFile(
    event: ChangeEvent<HTMLInputElement>,
    target: 'member' | 'competition',
  ) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    clearMsg()

    try {
      const text = await file.text()
      const normalized = text.replace(/^\uFEFF/, '')
      if (target === 'member') {
        setMemberImportText(normalized)
        setMemberImportPreview(null)
      } else {
        setCompetitionImportText(normalized)
        setCompetitionImportPreview(null)
      }
      setSuccess(`已读取文件：${file.name}`)
    } catch (e) {
      setError(
        e instanceof Error ? `读取文件失败：${e.message}` : '读取文件失败，请检查文件编码后重试',
      )
    } finally {
      event.target.value = ''
    }
  }

  async function previewMemberImport() {
    clearMsg()
    setSubmitting(true)

    try {
      const latestMembers = members.length > 0 ? members : await fetchMembers()
      if (members.length === 0 && latestMembers.length > 0) {
        setMembers(latestMembers)
      }

      const rows = parseMemberImportCsv(memberImportText)
      const warnings = checkMemberImportRows(rows, latestMembers)

      setMemberImportPreview({
        rowCount: rows.length,
        warnings,
        samples: rows.slice(0, 5).map((row) => ({
          rowNumber: row.rowNumber,
          name: row.draft.name,
          cohortYear: row.draft.cohortYear,
          handle: row.draft.handle,
          isActive: row.draft.isActive,
        })),
      })

      setSuccess(
        warnings.length > 0
          ? `队员 CSV 预检完成：${rows.length} 行，可导入；发现 ${warnings.length} 条提醒。`
          : `队员 CSV 预检通过：${rows.length} 行可导入。`,
      )
    } catch (e) {
      setMemberImportPreview(null)
      setError(e instanceof Error ? e.message : '队员 CSV 预检失败')
    } finally {
      setSubmitting(false)
    }
  }

  async function previewCompetitionImport() {
    clearMsg()
    setSubmitting(true)

    try {
      const [latestMembers, latestCompetitions] = await Promise.all([
        members.length > 0 ? Promise.resolve(members) : fetchMembers(),
        competitions.length > 0 ? Promise.resolve(competitions) : fetchCohortOverview(),
      ])

      if (members.length === 0 && latestMembers.length > 0) {
        setMembers(latestMembers)
      }
      if (competitions.length === 0 && latestCompetitions.length > 0) {
        setCompetitions(latestCompetitions)
      }

      const rows = parseCompetitionImportCsv(competitionImportText, latestMembers)
      const warnings = checkCompetitionImportRows(rows, latestCompetitions)

      setCompetitionImportPreview({
        rowCount: rows.length,
        warnings,
        samples: rows.slice(0, 5).map((row) => ({
          rowNumber: row.rowNumber,
          title: row.draft.title,
          category: row.draft.category,
          seasonYear: row.draft.seasonYear,
          memberCount: row.draft.memberIds.length,
          hasStanding: Boolean(
            row.draft.teamName?.trim() || row.draft.rank?.trim() || row.draft.award?.trim(),
          ),
        })),
      })

      setSuccess(
        warnings.length > 0
          ? `赛事 CSV 预检完成：${rows.length} 行，可导入；发现 ${warnings.length} 条提醒。`
          : `赛事 CSV 预检通过：${rows.length} 行可导入。`,
      )
    } catch (e) {
      setCompetitionImportPreview(null)
      setError(e instanceof Error ? e.message : '赛事 CSV 预检失败')
    } finally {
      setSubmitting(false)
    }
  }

  async function submitMemberImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    clearMsg()
    setSubmitting(true)

    let importedCount = 0
    try {
      const latestMembers = members.length > 0 ? members : await fetchMembers()
      if (members.length === 0 && latestMembers.length > 0) {
        setMembers(latestMembers)
      }

      const rows = parseMemberImportCsv(memberImportText)
      const warnings = checkMemberImportRows(rows, latestMembers)

      setMemberImportPreview({
        rowCount: rows.length,
        warnings,
        samples: rows.slice(0, 5).map((row) => ({
          rowNumber: row.rowNumber,
          name: row.draft.name,
          cohortYear: row.draft.cohortYear,
          handle: row.draft.handle,
          isActive: row.draft.isActive,
        })),
      })

      if (
        warnings.length > 0 &&
        !window.confirm(`预检发现 ${warnings.length} 条提醒，是否仍继续导入？`)
      ) {
        setSuccess('已取消导入，请根据预检提醒修改后重试。')
        return
      }

      for (const row of rows) {
        try {
          await createMember(row.draft)
          importedCount += 1
        } catch (e) {
          const reason = e instanceof Error ? e.message : '写入失败'
          throw new Error(
            importedCount > 0
              ? `已成功导入 ${importedCount} 条，CSV 第 ${row.rowNumber} 行失败：${reason}`
              : `CSV 第 ${row.rowNumber} 行导入失败：${reason}`,
          )
        }
      }

      await loadData()
      setMemberImportText('')
      setMemberImportPreview(null)
      setSuccess(`队员批量导入完成，共 ${importedCount} 条`)
    } catch (e) {
      if (importedCount > 0) {
        await loadData()
      }
      setError(e instanceof Error ? e.message : '批量导入队员失败')
    } finally {
      setSubmitting(false)
    }
  }

  async function submitCompetitionImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    clearMsg()
    setSubmitting(true)

    let importedCount = 0
    try {
      const [latestMembers, latestCompetitions] = await Promise.all([
        members.length > 0 ? Promise.resolve(members) : fetchMembers(),
        competitions.length > 0 ? Promise.resolve(competitions) : fetchCohortOverview(),
      ])

      if (members.length === 0 && latestMembers.length > 0) {
        setMembers(latestMembers)
      }
      if (competitions.length === 0 && latestCompetitions.length > 0) {
        setCompetitions(latestCompetitions)
      }

      const rows = parseCompetitionImportCsv(competitionImportText, latestMembers)
      const warnings = checkCompetitionImportRows(rows, latestCompetitions)

      setCompetitionImportPreview({
        rowCount: rows.length,
        warnings,
        samples: rows.slice(0, 5).map((row) => ({
          rowNumber: row.rowNumber,
          title: row.draft.title,
          category: row.draft.category,
          seasonYear: row.draft.seasonYear,
          memberCount: row.draft.memberIds.length,
          hasStanding: Boolean(
            row.draft.teamName?.trim() || row.draft.rank?.trim() || row.draft.award?.trim(),
          ),
        })),
      })

      if (
        warnings.length > 0 &&
        !window.confirm(`预检发现 ${warnings.length} 条提醒，是否仍继续导入？`)
      ) {
        setSuccess('已取消导入，请根据预检提醒修改后重试。')
        return
      }

      for (const row of rows) {
        try {
          await createCompetition(row.draft)
          importedCount += 1
        } catch (e) {
          const reason = e instanceof Error ? e.message : '写入失败'
          throw new Error(
            importedCount > 0
              ? `已成功导入 ${importedCount} 条，CSV 第 ${row.rowNumber} 行失败：${reason}`
              : `CSV 第 ${row.rowNumber} 行导入失败：${reason}`,
          )
        }
      }

      await loadData()
      setCompetitionImportText('')
      setCompetitionImportPreview(null)
      setSuccess(`赛事批量导入完成，共 ${importedCount} 条`)
    } catch (e) {
      if (importedCount > 0) {
        await loadData()
      }
      setError(e instanceof Error ? e.message : '批量导入赛事失败')
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

  async function submitUpdateCompetitionInfo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingCompetitionKey) return

    const targetGroup = competitionGroups.find((group) => group.key === editingCompetitionKey)
    if (!targetGroup) {
      setError('未找到待编辑比赛，请刷新后重试')
      return
    }

    clearMsg()
    setSubmitting(true)
    try {
      const baseDraft = toCompetitionDraft(editCompetitionForm)

      await Promise.all(
        targetGroup.entries.map((entry) =>
          updateCompetition(entry.id, {
            ...baseDraft,
            teamName: entry.teamName ?? undefined,
            rank: entry.rank ?? undefined,
            award: entry.award ?? undefined,
            memberIds: entry.participants.map((member) => member.id),
          }),
        ),
      )

      setEditingCompetitionKey(null)
      await loadData()
      setSuccess('比赛信息更新成功')
    } catch (e) {
      setError(e instanceof Error ? e.message : '更新比赛信息失败')
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

  async function onDeleteCompetitionGroup(group: CompetitionGroup) {
    if (!window.confirm(`确定删除比赛「${group.title}」及其全部战绩吗？`)) return

    clearMsg()
    setSubmitting(true)
    try {
      await Promise.all(group.entries.map((entry) => deleteCompetition(entry.id)))
      if (editingCompetitionKey === group.key) {
        setEditingCompetitionKey(null)
      }
      await loadData()
      setSuccess('比赛删除成功')
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除比赛失败')
    } finally {
      setSubmitting(false)
    }
  }

  function toggleMemberSelection(memberId: string, checked: boolean) {
    setSelectedMemberIds((previous) => {
      if (checked) {
        return previous.includes(memberId) ? previous : [...previous, memberId]
      }
      return previous.filter((id) => id !== memberId)
    })
  }

  function toggleCurrentPageMembers(checked: boolean) {
    setSelectedMemberIds((previous) => {
      if (checked) {
        const merged = new Set([...previous, ...currentPageMemberIds])
        return [...merged]
      }
      return previous.filter((id) => !currentPageMemberIds.includes(id))
    })
  }

  function toggleCompetitionSelection(groupKey: string, checked: boolean) {
    setSelectedCompetitionKeys((previous) => {
      if (checked) {
        return previous.includes(groupKey) ? previous : [...previous, groupKey]
      }
      return previous.filter((key) => key !== groupKey)
    })
  }

  function toggleCurrentPageCompetitions(checked: boolean) {
    setSelectedCompetitionKeys((previous) => {
      if (checked) {
        const merged = new Set([...previous, ...currentPageCompetitionKeys])
        return [...merged]
      }
      return previous.filter((key) => !currentPageCompetitionKeys.includes(key))
    })
  }

  async function onBatchDeleteMembers() {
    if (selectedMemberIds.length === 0) {
      return
    }

    if (!window.confirm(`确定批量删除已选中的 ${selectedMemberIds.length} 名队员吗？`)) {
      return
    }

    clearMsg()
    setSubmitting(true)

    let completedCount = 0
    try {
      for (const memberId of selectedMemberIds) {
        try {
          await deleteMember(memberId)
          completedCount += 1
          if (editingMemberId === memberId) {
            setEditingMemberId(null)
          }
        } catch (e) {
          const reason = e instanceof Error ? e.message : '删除失败'
          throw new Error(
            completedCount > 0
              ? `已删除 ${completedCount} 名队员，后续删除失败：${reason}`
              : `批量删除失败：${reason}`,
          )
        }
      }

      setSelectedMemberIds([])
      await loadData()
      setSuccess(`已批量删除 ${completedCount} 名队员`)
    } catch (e) {
      if (completedCount > 0) {
        await loadData()
      }
      setError(e instanceof Error ? e.message : '批量删除队员失败')
    } finally {
      setSubmitting(false)
    }
  }

  async function onBatchDeleteCompetitionGroups() {
    if (selectedCompetitionKeys.length === 0) {
      return
    }

    const selectedGroups = competitionGroups.filter((group) =>
      selectedCompetitionKeys.includes(group.key),
    )

    if (selectedGroups.length === 0) {
      setSelectedCompetitionKeys([])
      return
    }

    const totalStandings = selectedGroups.reduce((sum, group) => sum + group.entries.length, 0)
    if (
      !window.confirm(
        `确定批量删除 ${selectedGroups.length} 场比赛（共 ${totalStandings} 条战绩记录）吗？`,
      )
    ) {
      return
    }

    clearMsg()
    setSubmitting(true)

    let completedCount = 0
    try {
      for (const group of selectedGroups) {
        try {
          await Promise.all(group.entries.map((entry) => deleteCompetition(entry.id)))
          completedCount += 1
          if (editingCompetitionKey === group.key) {
            setEditingCompetitionKey(null)
          }
        } catch (e) {
          const reason = e instanceof Error ? e.message : '删除失败'
          throw new Error(
            completedCount > 0
              ? `已删除 ${completedCount} 场比赛，后续删除失败：${reason}`
              : `批量删除比赛失败：${reason}`,
          )
        }
      }

      setSelectedCompetitionKeys([])
      await loadData()
      setSuccess(`已批量删除 ${completedCount} 场比赛`)
    } catch (e) {
      if (completedCount > 0) {
        await loadData()
      }
      setError(e instanceof Error ? e.message : '批量删除比赛失败')
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
              <h3>批量导入</h3>
              <p>支持 UTF-8 CSV 文件导入，也支持直接粘贴 CSV 文本（建议先下载模板）。</p>
            </div>

            <div className="sub-panel">
              <h4>队员批量导入</h4>
              <p className="status-hint">
                必填列：name、cohortYear；可选列：handle、major、isActive（支持 true/false、是/否、在队/离队）。
              </p>
              <div className="hero-actions">
                <button className="btn" type="button" onClick={downloadMemberImportTemplate}>
                  下载队员模板 CSV
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    setMemberImportText('')
                    setMemberImportPreview(null)
                  }}
                >
                  清空文本
                </button>
                <button
                  className="btn"
                  type="button"
                  disabled={submitting || memberImportText.trim().length === 0}
                  onClick={() => void previewMemberImport()}
                >
                  {submitting ? '预检中...' : '预检队员 CSV'}
                </button>
              </div>
              <form className="form-grid inline-wrap" onSubmit={submitMemberImport}>
                <label className="full-width">
                  上传 CSV（UTF-8）
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) => void fillImportTextFromFile(event, 'member')}
                  />
                </label>
                <label className="full-width">
                  CSV 文本
                  <textarea
                    rows={7}
                    value={memberImportText}
                    onChange={(event) => {
                      setMemberImportText(event.target.value)
                      setMemberImportPreview(null)
                    }}
                    placeholder="name,cohortYear,handle,major,isActive"
                    required
                  />
                </label>
                <button className="btn btn-solid" disabled={submitting}>
                  {submitting ? '导入中...' : '批量导入队员'}
                </button>
              </form>
              {memberImportPreview ? (
                <div className="inline-wrap">
                  <p className="status-hint">预检结果：{memberImportPreview.rowCount} 行可解析。</p>
                  {memberImportPreview.warnings.length > 0 ? (
                    <ul className="simple-list import-warning-list">
                      {memberImportPreview.warnings.slice(0, 8).map((warning, index) => (
                        <li key={`member-warning-${warning.rowNumber}-${index}`}>
                          <span>第 {warning.rowNumber} 行</span>
                          <strong>{warning.message}</strong>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="status status-success">未发现重复或异常提醒，可直接导入。</p>
                  )}
                  {memberImportPreview.warnings.length > 8 ? (
                    <p className="status-hint">
                      还有 {memberImportPreview.warnings.length - 8} 条提醒未展示，请先修正后再导入。
                    </p>
                  ) : null}
                  <p className="status-hint">
                    预览前 {memberImportPreview.samples.length} 行：
                    {memberImportPreview.samples
                      .map(
                        (sample) =>
                          `#${sample.rowNumber} ${sample.name}/${sample.cohortYear}${
                            sample.handle ? ` (${sample.handle})` : ''
                          }/${sample.isActive ? '在队' : '离队'}`,
                      )
                      .join('；')}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="sub-panel inline-wrap">
              <h4>赛事 / 战绩批量导入</h4>
              <p className="status-hint">
                必填列：title、category、seasonYear；members 列可填队员姓名、handle 或 ID（多个值用逗号/分号分隔）。
              </p>
              <div className="hero-actions">
                <button className="btn" type="button" onClick={downloadCompetitionImportTemplate}>
                  下载赛事模板 CSV
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    setCompetitionImportText('')
                    setCompetitionImportPreview(null)
                  }}
                >
                  清空文本
                </button>
                <button
                  className="btn"
                  type="button"
                  disabled={submitting || competitionImportText.trim().length === 0}
                  onClick={() => void previewCompetitionImport()}
                >
                  {submitting ? '预检中...' : '预检赛事 CSV'}
                </button>
              </div>
              <form className="form-grid inline-wrap" onSubmit={submitCompetitionImport}>
                <label className="full-width">
                  上传 CSV（UTF-8）
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) => void fillImportTextFromFile(event, 'competition')}
                  />
                </label>
                <label className="full-width">
                  CSV 文本
                  <textarea
                    rows={8}
                    value={competitionImportText}
                    onChange={(event) => {
                      setCompetitionImportText(event.target.value)
                      setCompetitionImportPreview(null)
                    }}
                    placeholder="title,category,seasonYear,contestLevel,happenedAt,teamName,rank,award,members,remark"
                    required
                  />
                </label>
                <button className="btn btn-solid" disabled={submitting}>
                  {submitting ? '导入中...' : '批量导入赛事'}
                </button>
              </form>
              {competitionImportPreview ? (
                <div className="inline-wrap">
                  <p className="status-hint">
                    预检结果：{competitionImportPreview.rowCount} 行可解析。
                  </p>
                  {competitionImportPreview.warnings.length > 0 ? (
                    <ul className="simple-list import-warning-list">
                      {competitionImportPreview.warnings.slice(0, 8).map((warning, index) => (
                        <li key={`competition-warning-${warning.rowNumber}-${index}`}>
                          <span>第 {warning.rowNumber} 行</span>
                          <strong>{warning.message}</strong>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="status status-success">未发现重复或异常提醒，可直接导入。</p>
                  )}
                  {competitionImportPreview.warnings.length > 8 ? (
                    <p className="status-hint">
                      还有 {competitionImportPreview.warnings.length - 8} 条提醒未展示，请先修正后再导入。
                    </p>
                  ) : null}
                  <p className="status-hint">
                    预览前 {competitionImportPreview.samples.length} 行：
                    {competitionImportPreview.samples
                      .map(
                        (sample) =>
                          `#${sample.rowNumber} ${sample.title}/${CONTEST_TYPE_LABELS[sample.category]}/${
                            sample.seasonYear
                          }/成员${sample.memberCount}人/${sample.hasStanding ? '含战绩' : '仅主档案'}`,
                      )
                      .join('；')}
                  </p>
                </div>
              ) : null}
            </div>

            <p className="todo-note">
              TODO: 批量导入后续补充“Excel(xlsx) 直传解析 + 失败自动回滚 + 按唯一键覆盖更新”。
            </p>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h3>队员列表 / 编辑</h3>
              <p>
                共 {members.length} 名队员，已选 {selectedMemberIds.length} 名；当前第 {memberPage} /{' '}
                {memberPageCount} 页。
              </p>
            </div>
            <div className="hero-actions">
              <label>
                每页数量
                <select
                  value={memberPageSize}
                  onChange={(event) => {
                    setMemberPageSize(Number(event.target.value))
                    setMemberPage(1)
                  }}
                  disabled={submitting}
                >
                  {ADMIN_PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={`member-page-size-${size}`} value={size}>
                      {size} 条/页
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn btn-danger"
                disabled={submitting || selectedMemberIds.length === 0}
                onClick={() => void onBatchDeleteMembers()}
              >
                批量删除队员（{selectedMemberIds.length}）
              </button>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={allCurrentMembersSelected}
                          onChange={(event) => toggleCurrentPageMembers(event.target.checked)}
                        />
                        本页全选
                      </label>
                    </th>
                    <th>姓名</th>
                    <th>届别</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedMembers.map((member) => (
                    <tr key={member.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedMemberIds.includes(member.id)}
                          onChange={(event) =>
                            toggleMemberSelection(member.id, event.target.checked)
                          }
                          disabled={submitting}
                        />
                      </td>
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
            <div className="pagination-row">
              <button
                className="btn"
                type="button"
                onClick={() => setMemberPage((previous) => Math.max(1, previous - 1))}
                disabled={memberPage <= 1 || submitting}
              >
                上一页
              </button>
              <span className="status-hint">
                第 {memberPage} / {memberPageCount} 页（本页 {pagedMembers.length} 条）
              </span>
              <button
                className="btn"
                type="button"
                onClick={() =>
                  setMemberPage((previous) => Math.min(memberPageCount, previous + 1))
                }
                disabled={memberPage >= memberPageCount || submitting}
              >
                下一页
              </button>
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
              <p>可直接编辑/删除比赛基础信息；战绩请点“管理战绩”进入详情页维护。</p>
            </div>
            <div className="hero-actions">
              <label>
                每页数量
                <select
                  value={competitionPageSize}
                  onChange={(event) => {
                    setCompetitionPageSize(Number(event.target.value))
                    setCompetitionPage(1)
                  }}
                  disabled={submitting}
                >
                  {ADMIN_PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={`competition-page-size-${size}`} value={size}>
                      {size} 条/页
                    </option>
                  ))}
                </select>
              </label>
              <span className="status-hint">
                共 {competitionGroups.length} 场比赛，已选 {selectedCompetitionKeys.length} 场；当前第{' '}
                {competitionPage} / {competitionPageCount} 页。
              </span>
              <button
                type="button"
                className="btn btn-danger"
                disabled={submitting || selectedCompetitionKeys.length === 0}
                onClick={() => void onBatchDeleteCompetitionGroups()}
              >
                批量删除比赛（{selectedCompetitionKeys.length}）
              </button>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={allCurrentCompetitionsSelected}
                          onChange={(event) =>
                            toggleCurrentPageCompetitions(event.target.checked)
                          }
                        />
                        本页全选
                      </label>
                    </th>
                    <th>赛事</th>
                    <th>分类</th>
                    <th>日期</th>
                    <th>比赛级别</th>
                    <th>战绩条数</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedCompetitionGroups.map((competition) => (
                    <tr key={competition.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedCompetitionKeys.includes(competition.key)}
                          onChange={(event) =>
                            toggleCompetitionSelection(competition.key, event.target.checked)
                          }
                          disabled={submitting}
                        />
                      </td>
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
                          <button
                            type="button"
                            className="btn btn-small"
                            onClick={() => {
                              setEditingCompetitionKey(competition.key)
                              setEditCompetitionForm({
                                title: competition.title,
                                category: competition.category,
                                seasonYear: String(competition.seasonYear),
                                contestLevel: competition.contestLevel ?? '',
                                happenedAt: competition.happenedAt ?? '',
                                remark: competition.remark ?? '',
                              })
                            }}
                          >
                            编辑比赛
                          </button>
                          <button
                            type="button"
                            className="btn btn-small btn-danger"
                            onClick={() => void onDeleteCompetitionGroup(competition)}
                          >
                            删除比赛
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination-row">
              <button
                className="btn"
                type="button"
                onClick={() => setCompetitionPage((previous) => Math.max(1, previous - 1))}
                disabled={competitionPage <= 1 || submitting}
              >
                上一页
              </button>
              <span className="status-hint">
                第 {competitionPage} / {competitionPageCount} 页（本页 {pagedCompetitionGroups.length} 条）
              </span>
              <button
                className="btn"
                type="button"
                onClick={() =>
                  setCompetitionPage((previous) => Math.min(competitionPageCount, previous + 1))
                }
                disabled={competitionPage >= competitionPageCount || submitting}
              >
                下一页
              </button>
            </div>

            {editingCompetitionKey ? (
              <form className="form-grid inline-wrap" onSubmit={submitUpdateCompetitionInfo}>
                <h4 className="full-width">编辑比赛基础信息</h4>
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
                <div className="action-row full-width">
                  <button className="btn btn-solid" disabled={submitting}>
                    更新比赛
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => setEditingCompetitionKey(null)}
                  >
                    取消
                  </button>
                </div>
              </form>
            ) : null}

            <p className="todo-note">
              TODO: 后台待补充“批量录入模板（复制上一条/粘贴多行）+ 比赛主档案与战绩拆表 + 批量删除事务回滚 + 服务端分页/筛选”。
            </p>
          </section>
        </>
      ) : null}
    </div>
  )
}
