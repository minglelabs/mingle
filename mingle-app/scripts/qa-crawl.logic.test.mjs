import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCollectExpression, isRiskyTarget, openedNewState } from './qa-crawl.mjs';

const target = (label, extra = {}) => ({ label, testId: '', role: 'button', external: false, hasFileInput: false, ...extra });

test('never taps controls that change data or open native UI', () => {
  for (const label of ['로그아웃', '게시물 삭제', '차단', '메시지 보내기', '팔로우', '맞팔로우', '팔로잉', '프로필 공유', '사진 추가', '코인 충전', '저장', 'Delete post']) {
    assert.equal(isRiskyTarget(target(label)), true, label);
  }
  assert.equal(isRiskyTarget(target('Privacy', { external: true })), true);
  assert.equal(isRiskyTarget(target('Avatar', { hasFileInput: true })), true);
  assert.equal(isRiskyTarget(target('알림', { role: 'switch' })), true);
});

test('taps menus, sheets, tabs and list screens', () => {
  for (const label of ['메뉴', '글쓰기', '친구에게 초대권 보내기', '신고', '게시물', '차단한 사용자', '보관함', '휴지통', '앱 이용 언어']) {
    assert.equal(isRiskyTarget(target(label)), false, label);
  }
  assert.equal(isRiskyTarget(target('팔로잉', { role: 'tab' })), false);
});

test('a new state is a new path, a new layer or new text', () => {
  const base = { path: '/ko/mypage', layers: 2, hash: 1 };
  assert.equal(openedNewState(base, { ...base }), false);
  assert.equal(openedNewState(base, { ...base, hash: 2 }), true);
  assert.equal(openedNewState(base, { ...base, layers: 3 }), true);
  assert.equal(openedNewState(base, { ...base, path: '/ko/mypage/follows' }), true);
});

test('the collect expression is self-contained', () => {
  assert.match(buildCollectExpression({ max: 5 }), /^\(function collectTapTargets/);
});
