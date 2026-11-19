import { getOpenRoomsResponse, postOpenRoomResponse } from "@/server/api/controllers/shared/public-room-controller";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = getOpenRoomsResponse;
export const POST = postOpenRoomResponse;
