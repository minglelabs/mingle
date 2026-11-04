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

- [ ] **iOS 다음 버전(2.3.3)**: 현지 문자로 검색해도 나오게 키워드에 앱 이름 표기를 추가함(2026-11-04, minglelabs/mingle#467). JSON에는 이미 들어가 있음. 2.3.2가 심사 대기 중이라 키워드가 잠겨 있어서 다음 버전으로 미룸.
  - ko `해시챗, 해쉬챗, 해시, 해쉬, 챗` (띄어 쓴 "해시 챗"도 낱말 단위로 걸림)
  - ja `ハッシュチャット, ハッシュ, チャット` · zh-cn/zh-tw `哈希聊天` · th `แฮชแชท` · ru `ХэшЧат, Хэш, Чат` · hi `हैशचैट`
  - ar `هاش شات` (100자 제한 때문에 `global`을 뺌. `mingle`/`مينغل`은 Mingle 검색용으로 남김)
  - 확인: 제출 후 App Store Connect에서 위 언어들의 키워드에 이 단어들이 보이는지.
  - Play는 같은 날 반영 완료(ko·ja는 짧은 설명과 긴 설명 첫 줄, 나머지는 긴 설명 첫 줄에 `HashChat (해시챗)` 형태로).
