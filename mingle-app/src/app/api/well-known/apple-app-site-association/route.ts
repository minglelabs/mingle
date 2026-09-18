import { NextResponse } from "next/server";

const DEFAULT_APP_ID = "3RFBMN8TKZ.com.minglelabs.mingle.rn";

export function GET() {
  const appId = process.env.IOS_ASSOCIATED_DOMAINS_APP_ID?.trim() || DEFAULT_APP_ID;
  return NextResponse.json(
    {
      applinks: {
        details: [
          {
            appID: appId,
            appIDs: [appId],
            paths: ["/p/*"],
            components: [
              {
                "/": "/p/*",
                comment: "Mingle shared profile links",
              },
            ],
          },
        ],
      },
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300",
      },
    },
  );
}
