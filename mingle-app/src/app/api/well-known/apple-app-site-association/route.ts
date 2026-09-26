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
            // Every public link that must open the app instead of Safari
            // belongs here: /p/ shared profiles and /s/ shared conversation
            // snapshots. A path missing from this list still renders the web
            // page, which is exactly the bug /s/ had.
            paths: ["/p/*", "/s/*"],
            components: [
              {
                "/": "/p/*",
                comment: "Mingle shared profile links",
              },
              {
                "/": "/s/*",
                comment: "Mingle shared conversation links",
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
