import { deletePhone, readPhone } from '@/server/api/controllers/shared/phone-contacts-controller'

export const runtime = 'nodejs'

export async function GET() {
  return readPhone()
}

export async function DELETE() {
  return deletePhone()
}
