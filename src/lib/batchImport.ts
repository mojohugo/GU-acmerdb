import { CONTEST_TYPE_LABELS, CONTEST_TYPE_ORDER } from './constants'
import type {
  Competition,
  CompetitionDraft,
  ContestCategory,
  Member,
  MemberDraft,
} from '../types'

export type ImportDraftRow<T> = {
  rowNumber: number
  draft: T
}

export type ImportWarning = {
  rowNumber: number
  message: string
}

type ParsedCsvTable = {
  headers: string[]
  rows: string[][]
}

const MEMBER_HEADER_ALIASES = {
  name: ['name', '姓名', '成员姓名'],
  cohortYear: ['cohortYear', 'cohort', 'cohort_year', '届别', '年级', '入学年份'],
  handle: ['handle', '昵称', '账号', 'acm账号', 'acm_handle'],
  major: ['major', '专业'],
  isActive: ['isActive', 'active', 'is_active', '状态', '是否在队', '在队状态'],
} as const

const COMPETITION_HEADER_ALIASES = {
  title: ['title', '赛事名称', '比赛名称', '赛事'],
  category: ['category', '赛事分类', '比赛分类', '分类'],
  seasonYear: ['seasonYear', 'season', 'season_year', '赛季', '赛季年份'],
  cohortYear: ['cohortYear', 'cohort_year', '届别', '届别要求'],
  contestLevel: ['contestLevel', 'contest_level', '比赛级别', '级别'],
  happenedAt: ['happenedAt', 'happened_at', '日期', '比赛日期'],
  teamName: ['teamName', 'team_name', '队伍', '队伍名', '队名'],
  rank: ['rank', '名次', '排名'],
  award: ['award', '奖项'],
  members: ['members', 'member', 'memberIds', 'member_ids', '成员', '队员', '参赛成员'],
  remark: ['remark', '备注'],
} as const

const TRUTHY_VALUES = new Set(
  ['true', '1', 'yes', 'y', '是', '在队', 'active'].map((value) => normalizeToken(value)),
)

const FALSY_VALUES = new Set(
  ['false', '0', 'no', 'n', '否', '离队', '退队', '毕业', 'inactive'].map((value) =>
    normalizeToken(value),
  ),
)

const CATEGORY_ALIAS_MAP = (() => {
  const aliasMap = new Map<string, ContestCategory>()
  for (const category of CONTEST_TYPE_ORDER) {
    aliasMap.set(normalizeToken(category), category)
    aliasMap.set(normalizeToken(CONTEST_TYPE_LABELS[category]), category)
  }
  aliasMap.set(normalizeToken('icpc'), 'icpc_regional')
  aliasMap.set(normalizeToken('ccpc'), 'ccpc_regional')
  return aliasMap
})()

function normalizeToken(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s_\-:：()（）【】[\]<>《》]/g, '')
}

function isRowEmpty(row: string[]) {
  return row.every((cell) => cell.trim().length === 0)
}

function parseCsvTable(csvText: string): ParsedCsvTable {
  const normalizedText = csvText
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')

  const rows: string[][] = []
  let currentRow: string[] = []
  let currentCell = ''
  let inQuotes = false

  for (let index = 0; index < normalizedText.length; index += 1) {
    const char = normalizedText[index]

    if (inQuotes) {
      if (char === '"') {
        const nextChar = normalizedText[index + 1]
        if (nextChar === '"') {
          currentCell += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        currentCell += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
      continue
    }

    if (char === ',') {
      currentRow.push(currentCell)
      currentCell = ''
      continue
    }

    if (char === '\n') {
      currentRow.push(currentCell)
      rows.push(currentRow)
      currentRow = []
      currentCell = ''
      continue
    }

    currentCell += char
  }

  if (inQuotes) {
    throw new Error('CSV 格式错误：存在未闭合的引号。')
  }

  currentRow.push(currentCell)
  rows.push(currentRow)

  while (rows.length > 0 && isRowEmpty(rows[rows.length - 1])) {
    rows.pop()
  }

  if (rows.length === 0) {
    throw new Error('CSV 内容为空，请先粘贴数据或上传文件。')
  }

  const [headers, ...dataRows] = rows
  if (isRowEmpty(headers)) {
    throw new Error('CSV 首行表头为空，请先填写列名。')
  }

  return {
    headers: headers.map((header) => header.trim()),
    rows: dataRows,
  }
}

function buildHeaderIndex(headers: string[]) {
  const map = new Map<string, number>()
  headers.forEach((header, index) => {
    const normalized = normalizeToken(header)
    if (normalized.length > 0 && !map.has(normalized)) {
      map.set(normalized, index)
    }
  })
  return map
}

function resolveHeaderIndex(
  headerIndex: Map<string, number>,
  aliases: readonly string[],
) {
  for (const alias of aliases) {
    const index = headerIndex.get(normalizeToken(alias))
    if (index !== undefined) {
      return index
    }
  }

  return undefined
}

function requireHeaderIndex(
  headerIndex: Map<string, number>,
  aliases: readonly string[],
  fieldLabel: string,
) {
  const index = resolveHeaderIndex(headerIndex, aliases)
  if (index === undefined) {
    throw new Error(`CSV 缺少必填列：${fieldLabel}`)
  }
  return index
}

function readCell(row: string[], index: number | undefined) {
  if (index === undefined || index < 0 || index >= row.length) {
    return ''
  }
  return row[index]?.trim() ?? ''
}

function parsePositiveInteger(
  rawValue: string,
  rowNumber: number,
  fieldLabel: string,
  options: {
    required: boolean
  },
) {
  const value = rawValue.trim()
  if (value.length === 0) {
    if (options.required) {
      throw new Error(`第 ${rowNumber} 行：${fieldLabel}不能为空。`)
    }
    return undefined
  }

  if (!/^\d+$/.test(value)) {
    throw new Error(`第 ${rowNumber} 行：${fieldLabel}必须是正整数。`)
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`第 ${rowNumber} 行：${fieldLabel}必须大于 0。`)
  }

  return parsed
}

function parseIsActive(rawValue: string, rowNumber: number) {
  const value = rawValue.trim()
  if (value.length === 0) {
    return true
  }

  const normalized = normalizeToken(value)
  if (TRUTHY_VALUES.has(normalized)) {
    return true
  }
  if (FALSY_VALUES.has(normalized)) {
    return false
  }

  throw new Error(
    `第 ${rowNumber} 行：是否在队仅支持 true/false、1/0、是/否、在队/离队。`,
  )
}

function parseCategory(rawValue: string, rowNumber: number): ContestCategory {
  const normalized = normalizeToken(rawValue)
  if (normalized.length === 0) {
    throw new Error(`第 ${rowNumber} 行：赛事分类不能为空。`)
  }

  const mapped = CATEGORY_ALIAS_MAP.get(normalized)
  if (mapped) {
    return mapped
  }

  if (normalized.includes('icpc')) {
    return 'icpc_regional'
  }
  if (normalized.includes('ccpc')) {
    return 'ccpc_regional'
  }

  throw new Error(
    `第 ${rowNumber} 行：无法识别赛事分类「${rawValue}」，请使用分类 key 或中文标签。`,
  )
}

function normalizeDate(rawValue: string, rowNumber: number) {
  const value = rawValue.trim()
  if (value.length === 0) {
    return undefined
  }

  const normalized = value.replace(/[./]/g, '-')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`第 ${rowNumber} 行：日期格式需为 YYYY-MM-DD。`)
  }

  const date = Date.parse(`${normalized}T00:00:00Z`)
  if (!Number.isFinite(date)) {
    throw new Error(`第 ${rowNumber} 行：日期「${rawValue}」无效。`)
  }

  return normalized
}

type MemberLookupItem = {
  id: string
  label: string
}

function appendMemberLookup(
  lookup: Map<string, MemberLookupItem[]>,
  key: string,
  item: MemberLookupItem,
) {
  const normalized = normalizeToken(key)
  if (normalized.length === 0) {
    return
  }

  const current = lookup.get(normalized) ?? []
  if (!current.some((entry) => entry.id === item.id)) {
    current.push(item)
  }
  lookup.set(normalized, current)
}

function buildMemberLookup(members: Member[]) {
  const lookup = new Map<string, MemberLookupItem[]>()

  for (const member of members) {
    if (!member.id) {
      continue
    }

    const label = member.handle?.trim()
      ? `${member.name}(${member.handle})`
      : member.name

    const item: MemberLookupItem = {
      id: member.id,
      label,
    }

    appendMemberLookup(lookup, member.id, item)
    appendMemberLookup(lookup, member.name, item)
    if (member.handle?.trim()) {
      appendMemberLookup(lookup, member.handle, item)
    }
  }

  return lookup
}

function resolveMemberIds(
  rawValue: string,
  rowNumber: number,
  lookup: Map<string, MemberLookupItem[]>,
) {
  const trimmed = rawValue.trim()
  if (trimmed.length === 0) {
    return []
  }

  const tokens = trimmed
    .split(/[,，;；、|/\n]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)

  const memberIds = new Set<string>()

  for (const token of tokens) {
    const matched = lookup.get(normalizeToken(token)) ?? []

    if (matched.length === 0) {
      throw new Error(
        `第 ${rowNumber} 行：未找到成员标识「${token}」，请先导入队员或改用 handle / ID。`,
      )
    }

    if (matched.length > 1) {
      const labels = matched.map((item) => item.label).join('、')
      throw new Error(
        `第 ${rowNumber} 行：成员标识「${token}」匹配到多名成员（${labels}），请改用唯一 handle 或 ID。`,
      )
    }

    memberIds.add(matched[0].id)
  }

  return [...memberIds]
}

export function parseMemberImportCsv(csvText: string): ImportDraftRow<MemberDraft>[] {
  const table = parseCsvTable(csvText)
  const headerIndex = buildHeaderIndex(table.headers)

  const nameIndex = requireHeaderIndex(
    headerIndex,
    MEMBER_HEADER_ALIASES.name,
    'name（姓名）',
  )
  const cohortYearIndex = requireHeaderIndex(
    headerIndex,
    MEMBER_HEADER_ALIASES.cohortYear,
    'cohortYear（届别）',
  )
  const handleIndex = resolveHeaderIndex(headerIndex, MEMBER_HEADER_ALIASES.handle)
  const majorIndex = resolveHeaderIndex(headerIndex, MEMBER_HEADER_ALIASES.major)
  const isActiveIndex = resolveHeaderIndex(headerIndex, MEMBER_HEADER_ALIASES.isActive)

  const rows: ImportDraftRow<MemberDraft>[] = []

  table.rows.forEach((row, index) => {
    const rowNumber = index + 2
    if (isRowEmpty(row)) {
      return
    }

    const name = readCell(row, nameIndex)
    if (name.length === 0) {
      throw new Error(`第 ${rowNumber} 行：姓名不能为空。`)
    }

    const cohortYear = parsePositiveInteger(
      readCell(row, cohortYearIndex),
      rowNumber,
      '届别',
      { required: true },
    )
    if (cohortYear === undefined) {
      throw new Error(`第 ${rowNumber} 行：届别不能为空。`)
    }

    const handle = readCell(row, handleIndex)
    const major = readCell(row, majorIndex)
    const isActive = parseIsActive(readCell(row, isActiveIndex), rowNumber)

    rows.push({
      rowNumber,
      draft: {
        name,
        cohortYear,
        handle: handle || undefined,
        major: major || undefined,
        isActive,
      },
    })
  })

  if (rows.length === 0) {
    throw new Error('未解析到可导入的队员记录，请至少保留一行非空数据。')
  }

  return rows
}

export function parseCompetitionImportCsv(
  csvText: string,
  members: Member[],
): ImportDraftRow<CompetitionDraft>[] {
  const table = parseCsvTable(csvText)
  const headerIndex = buildHeaderIndex(table.headers)

  const titleIndex = requireHeaderIndex(
    headerIndex,
    COMPETITION_HEADER_ALIASES.title,
    'title（赛事名称）',
  )
  const categoryIndex = requireHeaderIndex(
    headerIndex,
    COMPETITION_HEADER_ALIASES.category,
    'category（赛事分类）',
  )
  const seasonYearIndex = requireHeaderIndex(
    headerIndex,
    COMPETITION_HEADER_ALIASES.seasonYear,
    'seasonYear（赛季年份）',
  )
  const cohortYearIndex = resolveHeaderIndex(headerIndex, COMPETITION_HEADER_ALIASES.cohortYear)
  const contestLevelIndex = resolveHeaderIndex(
    headerIndex,
    COMPETITION_HEADER_ALIASES.contestLevel,
  )
  const happenedAtIndex = resolveHeaderIndex(headerIndex, COMPETITION_HEADER_ALIASES.happenedAt)
  const teamNameIndex = resolveHeaderIndex(headerIndex, COMPETITION_HEADER_ALIASES.teamName)
  const rankIndex = resolveHeaderIndex(headerIndex, COMPETITION_HEADER_ALIASES.rank)
  const awardIndex = resolveHeaderIndex(headerIndex, COMPETITION_HEADER_ALIASES.award)
  const membersIndex = resolveHeaderIndex(headerIndex, COMPETITION_HEADER_ALIASES.members)
  const remarkIndex = resolveHeaderIndex(headerIndex, COMPETITION_HEADER_ALIASES.remark)

  const memberLookup = buildMemberLookup(members)
  const rows: ImportDraftRow<CompetitionDraft>[] = []

  table.rows.forEach((row, index) => {
    const rowNumber = index + 2
    if (isRowEmpty(row)) {
      return
    }

    const title = readCell(row, titleIndex)
    if (title.length === 0) {
      throw new Error(`第 ${rowNumber} 行：赛事名称不能为空。`)
    }

    const category = parseCategory(readCell(row, categoryIndex), rowNumber)

    const seasonYear = parsePositiveInteger(
      readCell(row, seasonYearIndex),
      rowNumber,
      '赛季年份',
      { required: true },
    )
    if (seasonYear === undefined) {
      throw new Error(`第 ${rowNumber} 行：赛季年份不能为空。`)
    }

    const cohortYear = parsePositiveInteger(
      readCell(row, cohortYearIndex),
      rowNumber,
      '届别',
      { required: false },
    )

    const contestLevel = readCell(row, contestLevelIndex)
    const happenedAt = normalizeDate(readCell(row, happenedAtIndex), rowNumber)
    const teamName = readCell(row, teamNameIndex)
    const rank = readCell(row, rankIndex)
    const award = readCell(row, awardIndex)
    const remark = readCell(row, remarkIndex)
    const memberIds = resolveMemberIds(readCell(row, membersIndex), rowNumber, memberLookup)

    rows.push({
      rowNumber,
      draft: {
        title,
        category,
        seasonYear,
        cohortYear,
        contestLevel: contestLevel || undefined,
        happenedAt: happenedAt || undefined,
        teamName: teamName || undefined,
        rank: rank || undefined,
        award: award || undefined,
        remark: remark || undefined,
        memberIds,
      },
    })
  })

  if (rows.length === 0) {
    throw new Error('未解析到可导入的赛事记录，请至少保留一行非空数据。')
  }

  return rows
}

function normalizeNullableText(value: string | null | undefined) {
  return normalizeToken(value ?? '')
}

function toMemberNameCohortKey(name: string, cohortYear: number) {
  return `${normalizeToken(name)}|${cohortYear}`
}

function toCompetitionSignature(input: {
  title: string
  category: ContestCategory
  seasonYear: number
  happenedAt?: string | null
  contestLevel?: string | null
  teamName?: string | null
  rank?: string | null
  award?: string | null
  memberIds?: string[]
}) {
  const memberToken = (input.memberIds ?? [])
    .map((id) => normalizeToken(id))
    .filter((id) => id.length > 0)
    .sort()
    .join(',')

  return [
    normalizeToken(input.title),
    normalizeToken(input.category),
    String(input.seasonYear),
    normalizeNullableText(input.happenedAt),
    normalizeNullableText(input.contestLevel),
    normalizeNullableText(input.teamName),
    normalizeNullableText(input.rank),
    normalizeNullableText(input.award),
    memberToken,
  ].join('|')
}

export function checkMemberImportRows(
  rows: ImportDraftRow<MemberDraft>[],
  existingMembers: Member[],
): ImportWarning[] {
  const warnings: ImportWarning[] = []

  const existingHandleSet = new Set<string>()
  const existingNameCohortSet = new Set<string>()

  for (const item of existingMembers) {
    const handle = normalizeToken(item.handle ?? '')
    if (handle.length > 0) {
      existingHandleSet.add(handle)
    }
    existingNameCohortSet.add(toMemberNameCohortKey(item.name, item.cohortYear))
  }

  const handleFirstSeenRow = new Map<string, number>()
  const nameCohortFirstSeenRow = new Map<string, number>()

  for (const row of rows) {
    const { draft, rowNumber } = row

    const handle = normalizeToken(draft.handle ?? '')
    if (handle.length > 0) {
      const firstSeen = handleFirstSeenRow.get(handle)
      if (firstSeen !== undefined) {
        warnings.push({
          rowNumber,
          message: `handle 与第 ${firstSeen} 行重复：${draft.handle}`,
        })
      } else {
        handleFirstSeenRow.set(handle, rowNumber)
      }

      if (existingHandleSet.has(handle)) {
        warnings.push({
          rowNumber,
          message: `handle 与现有队员重复：${draft.handle}`,
        })
      }
    }

    const nameCohortKey = toMemberNameCohortKey(draft.name, draft.cohortYear)
    const firstSeenNameRow = nameCohortFirstSeenRow.get(nameCohortKey)
    if (firstSeenNameRow !== undefined) {
      warnings.push({
        rowNumber,
        message: `姓名 + 届别 与第 ${firstSeenNameRow} 行重复：${draft.name} / ${draft.cohortYear}`,
      })
    } else {
      nameCohortFirstSeenRow.set(nameCohortKey, rowNumber)
    }

    if (existingNameCohortSet.has(nameCohortKey)) {
      warnings.push({
        rowNumber,
        message: `姓名 + 届别 与现有队员重复：${draft.name} / ${draft.cohortYear}`,
      })
    }
  }

  return warnings
}

export function checkCompetitionImportRows(
  rows: ImportDraftRow<CompetitionDraft>[],
  existingCompetitions: Competition[],
): ImportWarning[] {
  const warnings: ImportWarning[] = []

  const existingSignatureSet = new Set<string>()
  for (const item of existingCompetitions) {
    existingSignatureSet.add(
      toCompetitionSignature({
        title: item.title,
        category: item.category,
        seasonYear: item.seasonYear,
        happenedAt: item.happenedAt,
        contestLevel: item.contestLevel,
        teamName: item.teamName,
        rank: item.rank,
        award: item.award,
        memberIds: item.participants.map((member) => member.id),
      }),
    )
  }

  const firstSeenRowBySignature = new Map<string, number>()
  for (const row of rows) {
    const { draft, rowNumber } = row
    const signature = toCompetitionSignature(draft)

    const firstSeen = firstSeenRowBySignature.get(signature)
    if (firstSeen !== undefined) {
      warnings.push({
        rowNumber,
        message: `赛事记录与第 ${firstSeen} 行内容重复（标题/分类/赛季/战绩/成员）。`,
      })
    } else {
      firstSeenRowBySignature.set(signature, rowNumber)
    }

    if (existingSignatureSet.has(signature)) {
      warnings.push({
        rowNumber,
        message: '赛事记录与现有数据疑似重复（请确认是否重复导入）。',
      })
    }

    if (draft.memberIds.length === 0 && (draft.rank || draft.award || draft.teamName)) {
      warnings.push({
        rowNumber,
        message: '该行含战绩信息但未绑定成员，导入后将显示为无成员战绩。',
      })
    }
  }

  return warnings
}

// TODO: 补充 xlsx 二进制解析、GBK/ANSI 编码自动识别与转码。
// TODO: 补充“按唯一键覆盖更新”模式（当前仅新增，不做 upsert）。
