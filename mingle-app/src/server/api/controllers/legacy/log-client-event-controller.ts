import { NextRequest } from 'next/server'
import { handleGetLogClientEventDeltaV1 } from '@/server/api/handlers/v1/log-client-event-delta-handler'
import { handleLogClientEventV1 } from '@/server/api/handlers/v1/log-client-event-handler'

export const runtime = 'nodejs'

export async function postLogClientEventForLegacy(request: NextRequest) {
  return handleLogClientEventV1(request)
}

export async function getLogClientEventDeltaForLegacy(request: NextRequest) {
  return handleGetLogClientEventDeltaV1(request)
}
