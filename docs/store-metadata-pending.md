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

- 음성 통화가 배포되면: 3번 슬라이드(`03-voice`)를 통화 화면으로 바꾸고, 한국어 부제에 `·통화`(일본어 `・通話`)를 붙인다. 그 전에는 넣지 않는다.
- 연락처 연동·초대 링크가 들어간 iOS 빌드(2.4.0)가 App Store에 나간 뒤: Railway prod에 `IOS_INVITE_UNIVERSAL_LINKS=1`을 넣으세요. 그 전에는 `/i/` 초대 링크가 앱이 아니라 웹 초대 페이지(코드 표시)로 열립니다. 옛 앱은 이 링크를 받으면 초대를 버리기 때문입니다. Android는 앱 매니페스트에 들어 있어 따로 할 일이 없습니다.

## 반영 완료

- 통번역 메신저 리포지셔닝: Play는 2026-11-12에 문구·스크린샷 업로드(#498). iOS 2.4.0 (119)에 앱 이름·부제·키워드·설명·릴리스 노트(`ios-appstore-sync-metadata`)와 스크린샷(`scripts/ios-appstore-upload.sh`)을 올려 2026-11-12 심사 제출. Android 2.4.0 (109) 프로덕션 제출.
  - 옛 검색어 유지: 한국어·일본어 키워드에서 뺀 `global,hangout,mingle`은 영어 키워드에 남아 있다(영어 전용 키워드가 한국·일본 스토어 검색에 잡히는 것을 2026-11-11에 확인). 옛 제목의 `easiest`, `translator`는 영어 제목·부제에 있고, 자리가 되는 언어(es, fr, it, pt, hi, th, vi)는 키워드에도 넣었다. de, ar, ru는 자리가 없어 영어 페이지에 의존한다.
- iOS 2.3.3: 현지 문자 검색 키워드(해시챗 등)를 `ios-appstore-sync-metadata`로 올려 제출함(2026-11-07, minglelabs/mingle#467). Play는 2026-11-04에 반영.
