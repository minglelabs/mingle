import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// HARD RULE wiring contract for the chat surfaces that cannot be mounted in a
// node test (the room, the list, panels): every place a name is shown renders
// the account badge, the disclosure sits pinned in the timeline, and a badge
// that must stay tappable later never ends up inside another <button>.

function parse(relativePath: string): ts.SourceFile {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
  return ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
}

function tagNameOf(node: ts.Node): string | null {
  if (ts.isJsxElement(node)) return node.openingElement.tagName.getText()
  if (ts.isJsxSelfClosingElement(node)) return node.tagName.getText()
  return null
}

function attributesOf(node: ts.Node): ts.JsxAttributes | null {
  if (ts.isJsxElement(node)) return node.openingElement.attributes
  if (ts.isJsxSelfClosingElement(node)) return node.attributes
  return null
}

function attributeText(node: ts.Node, name: string): string | null {
  const attribute = attributesOf(node)?.properties.find((property) => (
    ts.isJsxAttribute(property) && property.name.getText() === name
  ))
  return attribute && ts.isJsxAttribute(attribute) ? attribute.initializer?.getText() ?? '' : null
}

function findElements(tree: ts.SourceFile, tagName: string): ts.Node[] {
  const found: ts.Node[] = []
  const visit = (node: ts.Node) => {
    if (tagNameOf(node) === tagName) found.push(node)
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return found
}

function jsxAncestors(node: ts.Node): ts.Node[] {
  const ancestors: ts.Node[] = []
  for (let current = node.parent; current; current = current.parent) {
    if (tagNameOf(current)) ancestors.push(current)
  }
  return ancestors
}

function enclosingFunctionName(node: ts.Node): string | null {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isFunctionDeclaration(current) && current.name) return current.name.getText()
  }
  return null
}

function functionBody(tree: ts.SourceFile, name: string): string {
  let body = ''
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.getText() === name) body = node.getText()
    ts.forEachChild(node, visit)
  }
  visit(tree)
  if (!body) throw new Error(`missing function ${name}`)
  return body
}

describe('room (LivePhoneDemo.tsx)', () => {
  const tree = parse('./LivePhoneDemo.tsx')

  it('labels the header title beside, not inside, the rename button', () => {
    const badges = findElements(tree, 'ChatAccountBadge')
    const headerBadge = badges.find((node) => attributeText(node, 'kind') === '{conversationTitleBadge}')
    expect(headerBadge).toBeDefined()
    for (const badge of badges) {
      expect(jsxAncestors(badge).map(tagNameOf)).not.toContain('button')
    }
  })

  it('pins the disclosure at the top of the chat scroll container, gated by operatorDisclosure', () => {
    const [disclosure] = findElements(tree, 'ConversationOperatorDisclosure')
    expect(disclosure).toBeDefined()
    const scroll = jsxAncestors(disclosure).find((node) => attributeText(node, 'data-qa') === '"live-demo-chat-scroll"')
    expect(scroll).toBeDefined()
    expect(attributeText(disclosure, 'stickyTopPx')).toBe('{nativeChatTopSpacerPx}')
    const scrollText = scroll!.getText()
    const disclosureAt = scrollText.indexOf('<ConversationOperatorDisclosure')
    expect(scrollText.lastIndexOf('operatorDisclosure ?', disclosureAt)).toBeGreaterThan(-1)
    expect(disclosureAt).toBeLessThan(scrollText.indexOf('hasOlderUtterances &&'))
    expect(disclosureAt).toBeLessThan(scrollText.indexOf('timelineItems.map'))
  })

  it('labels invite and leave notice names', () => {
    expect(functionBody(tree, 'LivePhoneDemoLeaveNoticeRow')).toContain('labelNameWithAccountBadge(')
    const invite = functionBody(tree, 'LivePhoneDemoInviteNoticeRow')
    expect(invite).toContain('notice.invitedByBadge')
    expect(invite).toContain('notice.inviteeBadge')
  })
})

describe('other chat surfaces', () => {
  it('labels the chat list row title from the room members', () => {
    const tree = parse('../conversation-list.tsx')
    const badge = findElements(tree, 'ChatAccountBadge')
      .find((node) => attributeText(node, 'kind') === '{item.titleAccountBadge}')
    expect(badge).toBeDefined()
    expect(enclosingFunctionName(badge!)).toBe('ConversationRow')
    expect(functionBody(tree, 'mapConversationSummaryToItem'))
      .toContain('titleAccountBadge: resolveRoomAccountBadge(conversation.otherMembers)')
  })

  it('labels participants and reaction participants', () => {
    const panel = parse('./conversation-participants-panel.tsx')
    const panelBadge = findElements(panel, 'ChatAccountBadge')[0]
    expect(enclosingFunctionName(panelBadge)).toBe('ParticipantRow')
    expect(attributeText(panelBadge, 'kind')).toBe('{member.accountBadge}')

    const reactions = parse('./MessageReactionParticipants.tsx')
    const reactionBadge = findElements(reactions, 'ChatAccountBadge')[0]
    expect(enclosingFunctionName(reactionBadge)).toBe('ParticipantList')
    expect(jsxAncestors(reactionBadge).map(tagNameOf)).not.toContain('button')
  })

  it.each(['../conversation-spectate-screen.tsx', '../native-conversation-share-overlay.tsx'])(
    'shows the disclosure inside the shared-room message list (%s)',
    (path) => {
      const tree = parse(path)
      const [disclosure] = findElements(tree, 'ConversationOperatorDisclosure')
      expect(disclosure).toBeDefined()
      expect(jsxAncestors(disclosure).some((node) => attributeText(node, 'ref') === '{messagesContainerRef}')).toBe(true)
      expect(tree.getText()).toContain('state?.operatorDisclosure ?')
    },
  )
})
