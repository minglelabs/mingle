# 다음 스토어 릴리스에 반영할 메타데이터

App Store의 키워드·부제·설명·홍보 문구는 **버전마다 따로 저장**되고, 새 버전은 직전 버전의 값을 그대로 물려받습니다.
그래서 `mingle-app/rn/appstore-connect-info/appstore-connect-info.i18n.json`을 고쳐도, 릴리스 때 아래 명령을 돌리기 전에는 App Store에 들어가지 않습니다.

```bash
scripts/devbox ios-appstore-sync-metadata --dry-run
scripts/devbox ios-appstore-sync-metadata
```

Google Play 스토어 정보는 앱 버전과 상관없이 언제든 올릴 수 있습니다(`scripts/google-play-console-sync.mjs --skip-images --skip-details --languages <스크린샷 폴더 이름들>`). `--languages`는 Play 로케일(`ko-KR`)이 아니라 스크린샷 폴더 이름(`ko`, `zh-Hans`, `ar-SA`)으로 맞춥니다.

반영이 끝난 항목은 지우세요.

## 대기 중

- **통번역 메신저 리포지셔닝 (2026-11-12 작성)**: 앱 이름 `HashChat: 통번역 메신저`(15개 언어), 부제, 키워드, 홍보 문구, 설명 앞머리, 스크린샷 8장.
  - iOS: 다음 버전에서 `scripts/devbox ios-appstore-sync-metadata --dry-run` 후 실제 실행. 앱 이름·부제는 새 버전 심사와 함께 바뀐다. 스크린샷 업로드도 같이.
  - Play: `scripts/google-play-console-sync.mjs`로 문구와 이미지 업로드. 올리기 전까지 `google-play-console-media-snapshots.test.ts`가 실패하는 것이 정상.
  - 옛 검색어 유지: 한국어·일본어 키워드에서 뺀 `global,hangout,mingle`은 영어 키워드에 남아 있다(영어 전용 키워드가 한국·일본 스토어 검색에 잡히는 것을 2026-11-11에 확인). 옛 제목의 `easiest`, `translator`는 영어 제목·부제에 있고, 자리가 되는 언어(es, fr, it, pt, hi, th, vi)는 키워드에도 넣었다. de, ar, ru는 자리가 없어 영어 페이지에 의존한다.
  - 음성 통화가 배포되면: 3번 슬라이드(`03-voice`)를 통화 화면으로 바꾸고, 한국어 부제에 `·통화`(일본어 `・通話`)를 붙인다. 그 전에는 넣지 않는다.

## 반영 완료

- iOS 2.3.3: 현지 문자 검색 키워드(해시챗 등)를 `ios-appstore-sync-metadata`로 올려 제출함(2026-11-07, minglelabs/mingle#467). Play는 2026-11-04에 반영.
