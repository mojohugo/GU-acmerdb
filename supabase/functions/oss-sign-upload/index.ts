import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.100.1'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type UploadMediaType = 'certificate' | 'event_photo'

type UploadSignPayload = {
  competitionId: string
  standingCompetitionId?: string | null
  mediaType: UploadMediaType
  fileName: string
  contentType?: string
  fileSize?: number
}

function asErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'unknown error'
}

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

function normalizeEndpoint(endpoint: string) {
  return endpoint
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
}

function normalizeContentType(raw: string | undefined) {
  const trimmed = raw?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : 'application/octet-stream'
}

function normalizeFileName(raw: string) {
  const trimmed = raw.trim()
  const fallback = 'upload.bin'
  const withoutControlChars = [...(trimmed || fallback)]
    .filter((char) => {
      const code = char.charCodeAt(0)
      return code >= 32 && code !== 127
    })
    .join('')

  const safe = withoutControlChars
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .slice(-120)

  return safe.length > 0 ? safe : fallback
}

function encodeObjectKey(objectKey: string) {
  return objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

async function hmacSha1Base64(secret: string, source: string) {
  const encoder = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(source))
  const bytes = new Uint8Array(signatureBuffer)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const ossBucket = Deno.env.get('OSS_BUCKET')
  const ossEndpointRaw = Deno.env.get('OSS_ENDPOINT')
  const ossAccessKeyId = Deno.env.get('OSS_ACCESS_KEY_ID')
  const ossAccessKeySecret = Deno.env.get('OSS_ACCESS_KEY_SECRET')
  const ossPublicBaseUrl = Deno.env.get('OSS_PUBLIC_BASE_URL')

  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    !ossBucket ||
    !ossEndpointRaw ||
    !ossAccessKeyId ||
    !ossAccessKeySecret
  ) {
    return jsonResponse(500, {
      error:
        'Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OSS_BUCKET, OSS_ENDPOINT, OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET',
    })
  }

  const authHeader = request.headers.get('Authorization') || ''
  const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!accessToken) {
    return jsonResponse(401, { error: 'Missing bearer token' })
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(accessToken)

  if (userError || !user) {
    return jsonResponse(401, { error: 'Invalid auth token' })
  }

  const { data: adminRow, error: adminError } = await supabaseAdmin
    .from('admin_users')
    .select('is_admin')
    .eq('user_id', user.id)
    .maybeSingle()

  if (adminError) {
    return jsonResponse(500, { error: `Admin check failed: ${adminError.message}` })
  }

  if (!adminRow?.is_admin) {
    return jsonResponse(403, { error: 'Permission denied: admin required' })
  }

  let payload: UploadSignPayload
  try {
    payload = (await request.json()) as UploadSignPayload
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' })
  }

  const mediaType = payload.mediaType
  if (mediaType !== 'certificate' && mediaType !== 'event_photo') {
    return jsonResponse(400, { error: 'mediaType must be certificate or event_photo' })
  }

  if (!payload.competitionId || !UUID_PATTERN.test(payload.competitionId)) {
    return jsonResponse(400, { error: 'competitionId is invalid uuid' })
  }

  if (payload.standingCompetitionId && !UUID_PATTERN.test(payload.standingCompetitionId)) {
    return jsonResponse(400, { error: 'standingCompetitionId is invalid uuid' })
  }

  if (
    payload.fileSize !== undefined &&
    (!Number.isFinite(payload.fileSize) || payload.fileSize < 0)
  ) {
    return jsonResponse(400, { error: 'fileSize must be a non-negative number' })
  }

  const fileName = normalizeFileName(payload.fileName || 'upload.bin')
  const contentType = normalizeContentType(payload.contentType)
  const ossEndpoint = normalizeEndpoint(ossEndpointRaw)

  const prefix = mediaType === 'certificate' ? 'certificates' : 'event-photos'
  const standingPrefix = payload.standingCompetitionId
    ? `${payload.standingCompetitionId.slice(0, 8)}-`
    : ''
  const randomSuffix = crypto.randomUUID().slice(0, 8)
  const objectKey = `${prefix}/${payload.competitionId}/${standingPrefix}${Date.now()}-${randomSuffix}-${fileName}`

  const expires = Math.floor(Date.now() / 1000) + 10 * 60
  const canonicalResource = `/${ossBucket}/${objectKey}`
  const stringToSign = `PUT\n\n${contentType}\n${expires}\n${canonicalResource}`

  try {
    const signature = await hmacSha1Base64(ossAccessKeySecret, stringToSign)
    const encodedObjectKey = encodeObjectKey(objectKey)
    const uploadUrl =
      `https://${ossBucket}.${ossEndpoint}/${encodedObjectKey}` +
      `?OSSAccessKeyId=${encodeURIComponent(ossAccessKeyId)}` +
      `&Expires=${expires}` +
      `&Signature=${encodeURIComponent(signature)}`

    const publicBase = ossPublicBaseUrl
      ? ossPublicBaseUrl.replace(/\/+$/, '')
      : `https://${ossBucket}.${ossEndpoint}`
    const publicUrl = `${publicBase}/${encodedObjectKey}`

    return jsonResponse(200, {
      uploadUrl,
      publicUrl,
      objectKey,
      fileName,
      contentType,
      expiresAt: new Date(expires * 1000).toISOString(),
    })
  } catch (error) {
    return jsonResponse(500, {
      error: `Sign upload url failed: ${asErrorMessage(error)}`,
    })
  }
})
