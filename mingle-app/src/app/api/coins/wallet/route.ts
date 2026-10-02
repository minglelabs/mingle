import { readCoinWallet } from '@/server/api/controllers/shared/coins-controller'

export const runtime = 'nodejs'

export async function GET() {
  return readCoinWallet()
}
