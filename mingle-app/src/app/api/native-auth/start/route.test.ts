import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/native-auth/start/route";

function buildRequest(cookieHeader: string) {
  return new NextRequest(
    "https://app.example/api/native-auth/start?provider=google&callbackUrl=%2Fko%2Fconversations&requestId=rq_1234567890ab",
    { headers: { cookie: cookieHeader } },
  );
}

describe("/api/native-auth/start", () => {
  const previousNextAuthUrl = process.env.NEXTAUTH_URL;
  beforeEach(() => {
    process.env.NEXTAUTH_URL = "https://app.example";
  });
  afterEach(() => {
    process.env.NEXTAUTH_URL = previousNextAuthUrl;
  });

  it("drops a website session left in the sheet so OAuth signs in fresh", async () => {
    const response = await GET(buildRequest(
      "__Secure-next-auth.session-token=old; __Secure-next-auth.session-token.0=old0; __Host-next-auth.csrf-token=x",
    ));

    const setCookies = response.headers.getSetCookie();
    const cleared = setCookies.filter((value) => /Max-Age=0/i.test(value)).map((value) => value.split("=", 1)[0]);
    expect(cleared.sort()).toEqual(["__Secure-next-auth.session-token", "__Secure-next-auth.session-token.0"]);
    expect(setCookies.some((value) => value.startsWith("__Host-next-auth.csrf-token"))).toBe(false);
    expect(response.headers.get("location")).toContain("/ko/auth/native?provider=google");
  });

  it("sets the return cookie without touching other cookies when there is no session", async () => {
    const response = await GET(buildRequest("__Host-next-auth.csrf-token=x"));

    const setCookies = response.headers.getSetCookie();
    expect(setCookies).toHaveLength(1);
    expect(setCookies[0]).toMatch(/^mingle-native-auth-return=/);
  });
});
