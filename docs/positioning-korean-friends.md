# HashChat 포지셔닝: 한국인-외국인 교류·언어교환 (2026-11-14)

이름은 HashChat 그대로 둔다. "통번역 메신저"에서 **한국인과 외국인이 친구가 되는 교류·언어교환 앱**으로 바꾼다. 실시간 통역은 앞에 내세우는 정체성이 아니라 "말이 서툴러도 바로 친해질 수 있는 이유"로 쓴다. 관광은 "한국 오기 전에 현지 친구 만들기" 정도로만 가볍게 엮는다.

## 누구에게 무엇을

| 대상 | 원하는 것 | 우리가 주는 것 |
|---|---|---|
| 외국인 (K-콘텐츠 팬, 한국어 학습자, 한국 여행 예정자) | 진짜 한국인 친구, 한국어 연습 | 인증된 한국인과 바로 대화. 한국어가 서툴러도 말하면 통역돼요. |
| 한국인 | 외국인 친구, 외국어 연습 | 초대로만 들어오는 커뮤니티. 메시지 폭탄 대신 원하는 상대와 대화해요. |

스토어와 홈페이지는 언어에 따라 대상을 나눈다. **한국어 페이지는 한국인에게, 나머지 언어는 외국인에게** 말한다.

## 핵심 메시지

- 한 줄 (외국인): **Make real Korean friends.** 한국어가 서툴러도 괜찮아요. 말하면 바로 통역돼요.
- 한 줄 (한국인): **외국인 친구, 여기서 사귀세요.** 통역 덕분에 언어교환이 첫날부터 돼요.
- 차별점 세 가지
  1. **인증된 한국인**: 한국인은 초대와 전화번호 인증으로 들어와요. 가짜 계정이 없어요.
  2. **말이 안 통해도 대화가 돼요**: 실시간 음성·채팅 통역. 언어교환이 첫날부터 돼요.
  3. **한국 오기 전에 현지 친구**: 여행 전에 친구를 만들고, 와서 직접 만나요.
- 쓰지 않는 말: "번역기", "통번역 메신저", "회의·통역"을 앞에 내세우는 표현. 검색어로만 남긴다(아래 키워드 규칙).

## 스토어 문구 (초안)

App Store 제목·부제는 30자, 키워드는 100바이트 제한.

| | 한국어 | 영어 (다른 언어의 기준) | 일본어 |
|---|---|---|---|
| 제목 | HashChat: 외국인 친구·언어교환 | HashChat: Make Korean Friends | HashChat: 韓国人の友達・言語交換 |
| 부제 | 말하면 통역되는 글로벌 친구 톡 | Language exchange, auto-translated | 話すと通訳される韓国語トーク |
| 홍보 문구 | 외국인 친구와 언어교환하세요. 말이 서툴러도 괜찮아요. 말하면 바로 통역돼요. | Meet verified Koreans and swap languages. Your Korean doesn't have to be perfect: speak and it's interpreted. | 本物の韓国人の友達と言語交換。韓国語が苦手でも、話せばすぐ通訳されます。 |

키워드 규칙 (`docs/store-metadata-pending.md`의 유지 규칙 그대로)
- 새로 앞에 두는 말: 언어교환, 외국인친구, 한국인친구, 펜팔, 한국어공부, 케이팝, 한국여행
- 옛 검색어는 지우지 않는다: 해시챗·밍글 계열, `translator`, `easiest`, `global,hangout,mingle`(영어)
- 영어 키워드 예: `korean friends,language exchange,learn korean,penpal,kpop,korea travel,meet koreans,translator,global,hangout,mingle`

카테고리: App Store 기본 카테고리를 **소셜 네트워킹**으로 둔다(현재 값은 ASC에서 확인 필요). Play도 **소셜**.

## 바꿀 곳

1. 스토어: `mingle-app/rn/appstore-connect-info/appstore-connect-info.i18n.json`, `mingle-app/rn/google-play-console-info/google-play-console-info.i18n.json` (15개 언어), 스크린샷 캡션 `mingle-app/rn/store-screenshots/captions.json`
2. 홈페이지: `mingle-landing/app/layout.tsx` 메타, `mingle-landing/locales/*.json`, 섹션 구성 `mingle-landing/configs/versions.ts`
3. 앱 안: 공유 카드 `mingle-app/src/lib/share-og.ts`, 마이크 권한 문구 `mingle-app/rn/ios/mingle/Info.plist`
4. 스토어에 올리는 건 사람이 확인한 뒤에: iOS는 다음 버전 제출 때 `scripts/devbox ios-appstore-sync-metadata`, Play는 `scripts/google-play-console-sync.mjs`.
