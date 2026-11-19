---
id: hash-rush-lobby-seats-and-ranking
title: Hash Rush lobby seats with several people; who is who, newcomers, spectators, host handover, and the rankings
priority: P2
environment: assisted
tags: [hash-rush, lobby, seats, spectate, host, ranking]
taste: [T5, T8, T13, T16, T18, T19]
paths:
  - mingle-app/src/features/hash-rush/HashRushCards.tsx
  - mingle-app/src/features/hash-rush/hash-rush-cards.module.css
  - mingle-app/src/features/hash-rush/client.ts
  - mingle-app/src/features/hash-rush/HashRushRankingPage.tsx
  - mingle-app/src/server/hash-rush/**
history:
  - 2026-11-12 — 해시러시 대기실: 설정은 모두에게, 컴퓨터는 빈자리마다
  - 2026-11-11 — 해시러시 메뉴 페이지, 방장 대기실, 랭킹
---

Needs a second member of the room in the same game (the owner's other device, or a second QA account on the
simulator); a third helps for step 6. Web sources (`docs/UIUX-ISSUES.md`, "대기실·방 목록·랭킹·게시판"): #35, #66,
#141, #148, #171, #217, #220, #224, #226, #166, #175, #195. The single-phone lobby (settings, computers, scroll) is
in `hash-rush-hosted-lobby`; my row's colour and the sticky Start in `hash-rush-room-game-lifecycle`.

## Steps

1. Phone hosts; the second player joins. On the phone, the newcomer's row glows yellow for about 4 s, then looks like
   the rest (web #141). The mode chip (`hash-rush-mode`, e.g. `🌻 초원 · 팀전`) reads the same on both devices
   (web #35).
2. On each device exactly one row is marked as me (`hash-rush-seat-me`, `나` badge); team is shown by colour dots, not
   team-name text (web #224). Two people with the same chat name are told apart (web #148: no identical names).
3. Open seats are faceless dashed rows, clearly not people or computers (web #66). Computers have a computer face and
   level.
4. Second player taps `hash-rush-stand` (관전하기): their row leaves the seats, their name shows in the spectator
   line, and nobody re-seats them automatically (web #217). `hash-rush-sit` brings them back; during a round it says
   they play from the next round (`hash-rush-sit-next`).
5. Second player leaves and rejoins quickly three times: never a ghost row or `<name>2` (web #220).
6. Host hands over with `hash-rush-hand-host` → `hash-rush-hand-host-confirm`: the crown moves on both devices within
   a second and only the new host can change settings (web #171). The old host leaving passes the room on.
7. A member whose chat name is `나` or very long: the row and the room message still read correctly (web #226).
8. After a round with both, open `hash-rush-menu-ranking`: the `이 대화방` tab (`hash-rush-ranking-tab-room`) lists both
   once each, my row marked `나`; computers are not listed. Tap the tab twice fast and reopen the page: no duplicated
   rows (web #166). `전체` tab loads too. Close the app and reopen the page: the rows are still there (web #195).

## Oracle (pass when)

- Everyone can tell which row is theirs, who just came, which seats are open (T16, T18).
- Spectating and sitting back work without the app forcing a seat; no ghost rows (T5, T13).
- Host handover is instant and consistent on both devices; rankings list each person once and keep them (T8, T19).

## Signals

- Game server log: `stand`, `sit`, `host` messages.
- `app_hash_rush_round_players` rows for the round (read-only query).

## Manual follow-up

- Four or more people with uneven teams.
