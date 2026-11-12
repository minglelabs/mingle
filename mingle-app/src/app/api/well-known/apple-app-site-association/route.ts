import { NextResponse } from "next/server";

const DEFAULT_APP_ID = "3RFBMN8TKZ.com.minglelabs.mingle.rn";

// /i/ invite links open the app only once an App Store build that reads them
// (2.3.4+) is out: this file is served by the server, so it also reaches
// older apps, which would swallow the link and drop the invite. Until then
// the link opens the invite web page, which shows the code and the store.
function inviteLinksOpenApp(): boolean {
  return process.env.IOS_INVITE_UNIVERSAL_LINKS?.trim() === "1";
}

export function GET() {
  const appId = process.env.IOS_ASSOCIATED_DOMAINS_APP_ID?.trim() || DEFAULT_APP_ID;
  const inviteLinks = inviteLinksOpenApp();
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
            paths: ["/p/*", "/s/*", ...(inviteLinks ? ["/i/*"] : [])],
            components: [
              {
                "/": "/p/*",
                comment: "HashChat shared profile links",
              },
              {
                "/": "/s/*",
                comment: "HashChat shared conversation links",
              },
              ...(inviteLinks
                ? [{ "/": "/i/*", comment: "HashChat invite ticket links" }]
                : []),
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
