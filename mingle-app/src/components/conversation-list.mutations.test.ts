import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { sanitizeSttLanguageSelection, sanitizeSttLanguageUnion } from "@/lib/stt-languages";
import {
  resolveLanguageSelectorOwnSelectedLanguages,
  resolveLanguageSelectorUnionAfterOwnLanguagesChange,
} from "./LivePhoneDemo/language-selector.logic";

// Exercise the actual React callback with its closure dependencies, without
// mounting the native/STT surface or merely checking for a source substring.
const source = readFileSync(new URL("./conversation-list.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("conversation-list.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function callbackSource(name: string): string {
  let result = "";
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name && node.initializer && ts.isCallExpression(node.initializer)) {
      result = node.initializer.arguments[0].getText(tree);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  if (!result) throw new Error(`Missing callback: ${name}`);
  return ts.transpileModule(`(${result})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}

describe("conversation-list mutation wiring", () => {
  it("queues selection and profile defaults while preserving other members' languages", () => {
    const enqueue = vi.fn();
    const fetch = vi.fn();
    const defaults = { current: ["ko", "en"] };
    const version = { current: 0 };
    const context = {
      authenticatedUserId: "me", sessionStatus: "authenticated", fetch,
      defaultSelectedLanguagesRef: defaults,
      defaultConversationLanguagesSyncVersionRef: version,
      conversationsRef: { current: [{
        id: "room", isMultiMember: true, selectedLanguages: ["ko", "en", "ja", "fr", "de", "es"],
        viewerSelectedLanguages: ["ko", "en"], translationLanguagesLinked: true,
        selectedLanguagesAttribution: { ko: ["me"], en: ["me", "other"], ja: ["other"], fr: ["other"], de: ["other"], es: ["other"] },
      }] },
      sanitizeSttLanguageSelection, sanitizeSttLanguageUnion,
      resolveLanguageSelectorOwnSelectedLanguages, resolveLanguageSelectorUnionAfterOwnLanguagesChange,
      setDefaultSelectedLanguages: vi.fn(), enqueueConversationMutationAndFlush: enqueue,
      buildConversationApiPath: (path: string) => `/api/conversations${path}`,
      buildClientApiPath: (path: string) => `/api${path}`,
    };
    const persistUserDefaultConversationLanguages = runInNewContext(callbackSource("persistUserDefaultConversationLanguages"), context);
    const select = runInNewContext(callbackSource("handleConversationSelectedLanguagesChange"), { ...context, persistUserDefaultConversationLanguages });
    select("room", ["ko"]);
    expect(fetch).not.toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(enqueue.mock.calls[0][0]).toMatchObject({
      kind: "selected-languages", body: { selectedLanguages: ["ko"] },
      patch: {
        selectedLanguages: ["ko", "en", "ja", "fr", "de", "es"], viewerSelectedLanguages: ["ko"],
        translationLanguagesLinked: false, selectedLanguagesAttribution: { en: ["other"], ko: ["me"] },
      },
    });
    expect(enqueue.mock.calls[1][0]).toMatchObject({ kind: "profile-default-languages", body: { defaultConversationLanguages: ["ko"] } });
  });
});
