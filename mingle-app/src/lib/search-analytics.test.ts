import { describe, expect, it } from "vitest";
import {
  buildSearchAnalyticsProperties,
  resolveSearchAnalyticsProperties,
} from "@/lib/search-analytics";

describe("search analytics privacy", () => {
  it("identifies a single Latin character without exposing longer query text", () => {
    expect(resolveSearchAnalyticsProperties(" a ")).toEqual({
      query_length: 1,
      query_script: "latin",
      query_shape: "single_latin_character",
      query_has_at_prefix: false,
      query_single_character: "a",
    });

    expect(resolveSearchAnalyticsProperties("royce")).toEqual({
      query_length: 5,
      query_script: "latin",
      query_shape: "handle_like",
      query_has_at_prefix: false,
      query_single_character: null,
    });
  });

  it("supports one-character diagnostics for Hangul searches", () => {
    expect(resolveSearchAnalyticsProperties("가")).toMatchObject({
      query_length: 1,
      query_script: "hangul",
      query_shape: "single_hangul_character",
      query_single_character: "가",
    });
  });

  it("adds a stable digest for a normalized query", async () => {
    const properties = await buildSearchAnalyticsProperties("  a  ");

    expect(properties.query_digest).toBe(
      "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
    );
  });
});
