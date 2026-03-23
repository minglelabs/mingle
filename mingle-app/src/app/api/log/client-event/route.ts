import {
  getLogClientEventDeltaForLegacy,
  postLogClientEventForLegacy,
} from '@/server/api/controllers/legacy/log-client-event-controller'

export const runtime = 'nodejs'
export const GET = getLogClientEventDeltaForLegacy
export const POST = postLogClientEventForLegacy
