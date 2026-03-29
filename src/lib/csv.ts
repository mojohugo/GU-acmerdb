type CsvCell = string | number | boolean | null | undefined

type DownloadCsvOptions = {
  filename: string
  headers: string[]
  rows: CsvCell[][]
}

function normalizeFilename(rawFilename: string) {
  const trimmed = rawFilename.trim()
  const baseName = trimmed.length > 0 ? trimmed : 'export'
  return baseName.toLowerCase().endsWith('.csv') ? baseName : `${baseName}.csv`
}

function escapeCell(value: CsvCell) {
  const normalized = value === null || value === undefined ? '' : String(value)
  const escaped = normalized.replaceAll('"', '""')

  if (/[",\n\r]/.test(escaped)) {
    return `"${escaped}"`
  }

  return escaped
}

function toCsvText(rows: CsvCell[][]) {
  return rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')
}

export function downloadCsv({ filename, headers, rows }: DownloadCsvOptions) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return
  }

  const csv = `\uFEFF${toCsvText([headers, ...rows])}`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = normalizeFilename(filename)
  anchor.style.display = 'none'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.URL.revokeObjectURL(url)
}
