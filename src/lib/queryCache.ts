type CacheEntry<T> = {
  value: T
  updatedAt: number
}

const STORAGE_PREFIX = 'gu-acmerdb:query-cache:'

const memoryCache = new Map<string, CacheEntry<unknown>>()
const inFlightRequests = new Map<string, Promise<unknown>>()

function readStorageEntry<T>(key: string): CacheEntry<T> | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${key}`)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as CacheEntry<T> | null
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.updatedAt !== 'number' ||
      !Number.isFinite(parsed.updatedAt)
    ) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

function writeStorageEntry<T>(key: string, entry: CacheEntry<T>) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(entry))
  } catch {
    // ignore quota or serialization errors
  }
}

function removeStorageEntry(key: string) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.removeItem(`${STORAGE_PREFIX}${key}`)
  } catch {
    // ignore
  }
}

function getEntry<T>(key: string): CacheEntry<T> | null {
  const fromMemory = memoryCache.get(key) as CacheEntry<T> | undefined
  if (fromMemory) {
    return fromMemory
  }

  const fromStorage = readStorageEntry<T>(key)
  if (fromStorage) {
    memoryCache.set(key, fromStorage as CacheEntry<unknown>)
    return fromStorage
  }

  return null
}

export function peekCachedValue<T>(key: string): T | null {
  const entry = getEntry<T>(key)
  return entry ? entry.value : null
}

export function isCacheFresh(key: string, maxAgeMs: number): boolean {
  const entry = getEntry(key)
  if (!entry) {
    return false
  }

  return Date.now() - entry.updatedAt <= maxAgeMs
}

export function setCachedValue<T>(key: string, value: T) {
  const entry: CacheEntry<T> = {
    value,
    updatedAt: Date.now(),
  }

  memoryCache.set(key, entry as CacheEntry<unknown>)
  writeStorageEntry(key, entry)
}

export function invalidateCacheKey(key: string) {
  memoryCache.delete(key)
  inFlightRequests.delete(key)
  removeStorageEntry(key)
}

export function invalidateCacheByPrefix(prefix: string) {
  const memoryKeys = [...memoryCache.keys()]
  for (const key of memoryKeys) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key)
    }
  }

  const pendingKeys = [...inFlightRequests.keys()]
  for (const key of pendingKeys) {
    if (key.startsWith(prefix)) {
      inFlightRequests.delete(key)
    }
  }

  if (typeof window === 'undefined') {
    return
  }

  try {
    const storageKeys: string[] = []
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const storageKey = window.localStorage.key(i)
      if (storageKey) {
        storageKeys.push(storageKey)
      }
    }

    for (const storageKey of storageKeys) {
      if (storageKey.startsWith(`${STORAGE_PREFIX}${prefix}`)) {
        window.localStorage.removeItem(storageKey)
      }
    }
  } catch {
    // ignore
  }
}

export async function fetchWithCache<T>(options: {
  key: string
  ttlMs: number
  fetcher: () => Promise<T>
}): Promise<T> {
  const { key, ttlMs, fetcher } = options

  const cached = getEntry<T>(key)
  if (cached && Date.now() - cached.updatedAt <= ttlMs) {
    return cached.value
  }

  const pending = inFlightRequests.get(key) as Promise<T> | undefined
  if (pending) {
    return pending
  }

  const request = (async () => {
    const value = await fetcher()
    setCachedValue(key, value)
    return value
  })()

  inFlightRequests.set(key, request)

  try {
    return await request
  } finally {
    inFlightRequests.delete(key)
  }
}
