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

(없음)

## 반영 완료

- iOS 2.3.3: 현지 문자 검색 키워드(해시챗 등)를 `ios-appstore-sync-metadata`로 올려 제출함(2026-11-07, minglelabs/mingle#467). Play는 2026-11-04에 반영.
