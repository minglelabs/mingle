# Windows PC에 LiveKit 서버(SFU) 직접 설치 인수인계서

작성일은 2026-10-30이고, 받는 사람은 Windows PC에서 일하는 Kiro다. 이 문서만 읽고 끝까지 진행할 수 있게 썼다.

## 0. 배경 (꼭 알아야 할 것만)

- mingle(HashChat) 대화방에 **보이스톡과 동시통역** 기능을 만들고 있다. PR은 minglelabs/mingle#313(Draft)이고, 브랜치는 `codex/voicetalk-hash-rush-planning-1db1e3`이다. 전체 맥락은 같은 브랜치의 `docs/voicetalk-hashrush-handoff.md`에 있다.
- 구조는 **SFU(LiveKit)와 서버 통역 에이전트**다. 폰들은 LiveKit에 접속하고, 통역 에이전트(`mingle-voice-agent/`)도 같은 방에 보이지 않는 참가자로 들어간다.
- 운영 서버인 Railway는 **공개 UDP 인바운드를 받지 못한다.** 그래서 LiveKit 서버를 따로 둬야 한다.
- 사용자는 LiveKit Cloud 대신 **항상 켜져 있는 이 Windows PC**에 LiveKit을 직접 설치하기로 했다. LiveKit 서버는 오픈소스(Apache 2.0)라서 무료이고, 분 수나 인원 제한도 없다.
- 예상 부하는 동시 50명 수준이다. 음성 한 줄이 약 40kbps라서, 서버 업로드 사용량은 약 16Mbps다. CPU 부담은 작다.
- 이 PC는 **음성 중계만 한다.** 통역 에이전트와 AI 호출(Soniox, 번역, Gemini TTS)은 Mac(나중에는 Railway)에서 돌고, 이 PC로 아웃바운드 연결만 한다.

## 1. 목표와 완료 기준

목표: 인터넷 어디서든(LTE 포함) `wss://<도메인>`으로 접속 가능한 LiveKit 서버를 이 PC에 띄우고, 재부팅해도 자동으로 다시 뜨게 한다.

완료 기준(전부 충족해야 한다):
1. `https://<도메인>`에 외부 네트워크(폰 LTE 등)에서 접속하면 LiveKit이 `OK`로 응답한다.
2. LiveKit 연결 테스트(9장)에서 WebRTC 연결이 **UDP로** 성공한다.
3. PC를 재부팅한 뒤 로그인하지 않아도 LiveKit과 Caddy가 자동으로 실행된다.
4. 사용자에게 보고서를 낸다(10장). 시크릿 값은 보고서에 넣지 않는다.

## 2. 지켜야 할 규칙

- 답변은 한국어 존댓말로, 간단명료하게 한다. 맨 끝에 100자 이내로 요약과 사용자가 할 일을 적는다.
- **API Secret은 화면, 채팅, 로그, 커밋 어디에도 출력하지 않는다.** 파일(`livekit.yaml`)에만 둔다. 사용자에게 전달할 때는 "파일 위치"만 알려 준다.
- 공유기 관리자 페이지 접속, 도메인 DNS 설정처럼 사용자 계정이 필요한 일은 **사용자에게 정확한 값과 단계를 안내**하고, 끝났다는 답을 받은 뒤 진행한다.
- 이 작업에 필요하지 않은 프로그램은 설치하지 않는다. 설치 전에는 이미 설치돼 있는지 먼저 확인한다.
- 7880(LiveKit HTTP와 시그널링) 포트는 **인터넷에 직접 열지 않는다.** 외부에서는 Caddy(443)를 거쳐서만 접근하게 한다.
- RDP, SMB 같은 다른 포트는 열지 않는다. 연 포트는 보고서에 전부 적는다.
- 멈출 수 있는 명령(다운로드, 서버 실행, 네트워크 테스트)에는 timeout을 건다.

## 3. 사전 확인 (먼저 사용자에게 받을 것)

| 항목 | 확인 방법 |
|---|---|
| 공인 IP가 고정인지 | 사용자는 "안 바뀐다"고 했다. `curl.exe -s https://api.ipify.org`로 현재 IP를 기록한다. |
| 공유기가 CGNAT 뒤가 아닌지 | 공유기 관리 페이지의 WAN IP가 위 공인 IP와 같아야 한다. 다르면(예: 100.64.x.x) 포트포워딩이 불가능하니 즉시 중단하고 보고한다. |
| 사용할 도메인 | 사용자에게 하위 도메인을 정해 달라고 한다(예: `voice.<회사도메인>`). DNS를 어디서 관리하는지(Cloudflare 등)도 묻는다. |
| 업로드 속도 | fast.com 등으로 측정해 기록한다. 20Mbps 이상이면 충분하다. |
| PC 사양 | `systeminfo`에서 OS, CPU, RAM을 기록한다. |

## 4. 설치 방식

**권장: Windows 네이티브 바이너리.** WSL2와 Docker Desktop은 NAT를 한 단계 더 거쳐서, UDP 포트 범위를 다루기 어렵다.

1. [LiveKit 릴리스](https://github.com/livekit/livekit/releases)에서 최신 안정 버전의 `livekit_<버전>_windows_amd64.zip`을 받는다.
   - Windows 자산이 없으면 그 사실을 보고한다. 그다음 WSL2를 `networkingMode=mirrored`(`%UserProfile%\.wslconfig`)로 설정해 Linux 바이너리를 쓰는 방법을 사용자에게 제안하고, 승인을 받은 뒤 진행한다.
2. `C:\livekit\`에 압축을 풀고, `C:\livekit\livekit-server.exe --version`으로 실행을 확인한다.
3. 키를 만든다: `C:\livekit\livekit-server.exe generate-keys`
   - 출력된 API Key와 Secret은 **바로 `livekit.yaml`에만 기록**한다. 터미널 기록이 남지 않게 주의하고, 출력 내용을 보고서나 채팅에 옮기지 않는다.

## 5. LiveKit 설정 (`C:\livekit\livekit.yaml`)

```yaml
port: 7880
bind_addresses:
  - "127.0.0.1"        # signaling only via Caddy
rtc:
  tcp_port: 7881       # ICE/TCP fallback when UDP is blocked
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true   # discover public IP via STUN; if wrong, set node_ip instead
  # node_ip: <PUBLIC_IP>
keys:
  <API_KEY>: <API_SECRET>
logging:
  level: info
room:
  empty_timeout: 300
  max_participants: 10
```

- `use_external_ip`로 찾은 IP가 3장의 공인 IP와 다르면, 그 줄을 지우고 `node_ip: <공인 IP>`를 쓴다. 시작 로그의 `nodeIP` 값으로 확인한다.
- `bind_addresses`를 127.0.0.1로 두면 시그널링은 Caddy만 받는다. RTC 포트(7881, 50000~60000)는 이 설정과 상관없이 외부에서 받는다. 시작 로그로 둘 다 확인한다.
- TURN은 1차에서는 켜지 않는다. 9장 테스트에서 일부 LTE나 회사망이 UDP와 TCP 7881을 모두 막는 것으로 확인되면, 2차로 TURN/TLS(443 공유 또는 5349)를 검토해 사용자에게 보고한다.

## 6. TLS와 도메인 (Caddy)

iOS 앱과 브라우저는 `wss://`만 허용하므로 인증서가 필요하다. Caddy를 쓰면 Let's Encrypt 인증서를 자동으로 받고 갱신한다.

1. **사용자 작업:** DNS에 A 레코드 `voice.<도메인> -> <공인 IP>`를 추가한다. Cloudflare라면 반드시 **DNS only(회색 구름)**로 둔다.
2. `nslookup voice.<도메인>`이 공인 IP를 돌려주는지 확인한다.
3. [Caddy 다운로드](https://caddyserver.com/download)에서 Windows amd64 실행 파일을 받아 `C:\caddy\caddy.exe`에 둔다.
4. `C:\caddy\Caddyfile`:

```
voice.<도메인> {
    reverse_proxy 127.0.0.1:7880
}
```

5. `C:\caddy\caddy.exe run --config C:\caddy\Caddyfile`로 띄우고, 인증서 발급 로그를 확인한다. 발급에는 80과 443 포트가 외부에서 열려 있어야 한다(7장).

## 7. 방화벽과 포트포워딩

**Windows 방화벽** (관리자 PowerShell):

```powershell
New-NetFirewallRule -DisplayName "LiveKit RTC UDP" -Direction Inbound -Protocol UDP -LocalPort 50000-60000 -Action Allow
New-NetFirewallRule -DisplayName "LiveKit RTC TCP" -Direction Inbound -Protocol TCP -LocalPort 7881 -Action Allow
New-NetFirewallRule -DisplayName "Caddy HTTP/HTTPS" -Direction Inbound -Protocol TCP -LocalPort 80,443 -Action Allow
```

`livekit-server.exe`나 `caddy.exe`를 처음 실행할 때 Windows가 네트워크 허용 창을 띄우면, "개인 네트워크"만 허용하고 위 규칙을 기준으로 삼는다.

**공유기 (사용자 작업, 값은 Kiro가 정확히 안내한다):**
1. PC의 LAN IP(`ipconfig`)를 DHCP 고정 할당(주소 예약)으로 묶는다.
2. 포트포워딩 대상은 모두 그 LAN IP다.

| 외부 포트 | 프로토콜 | 내부 포트 | 용도 |
|---|---|---|---|
| 80 | TCP | 80 | 인증서 발급, HTTPS 리다이렉트 |
| 443 | TCP | 443 | wss 시그널링(Caddy) |
| 7881 | TCP | 7881 | 미디어 TCP 폴백 |
| 50000-60000 | UDP | 50000-60000 | 미디어(주 경로) |

**주의:** 공유기가 NAT 루프백(헤어핀)을 지원하지 않으면, 같은 집 와이파이에서 도메인으로 접속하는 테스트는 실패할 수 있다. 외부 테스트는 반드시 **폰 LTE**로 한다.

## 8. 상시 실행 (재부팅해도 자동 시작)

- 서비스 등록: [NSSM](https://nssm.cc/)이 이미 있으면 사용한다. 없으면 설치해도 되는지 사용자에게 묻는다. 대안은 작업 스케줄러에 "시스템 시작 시, 로그인 여부와 관계없이 실행"과 "실패 시 1분 후 재시작"으로 등록하는 방법이다.
  - `livekit-server.exe --config C:\livekit\livekit.yaml` (작업 디렉터리 `C:\livekit`)
  - `caddy.exe run --config C:\caddy\Caddyfile` (작업 디렉터리 `C:\caddy`)
  - 로그는 `C:\livekit\logs\`와 `C:\caddy\logs\`에 남긴다.
- 전원 옵션: 절전과 최대 절전 모드를 끈다(`powercfg /change standby-timeout-ac 0`, `powercfg /change hibernate-timeout-ac 0`). 네트워크 어댑터의 "전원 절약을 위해 장치 끄기"도 해제한다.
- Windows Update: 사용 시간을 설정하고, 자동 재시작은 새벽으로 미룬다. 재부팅 후 서비스가 자동으로 뜨는 것까지 확인한다(완료 기준 3).

## 9. 검증

1. 로컬: `curl.exe -s http://127.0.0.1:7880` 결과가 `OK`인지 본다.
2. 외부(폰 LTE 브라우저): `https://voice.<도메인>`에 접속해 `OK`가 나오는지 본다.
3. WebRTC 연결 테스트:
   - [LiveKit CLI](https://github.com/livekit/livekit-cli/releases)(`lk.exe`)를 쓴다. 설치 전에 확인을 받는다.
   - 테스트 토큰을 만든다: `lk token create --url wss://voice.<도메인> --api-key <KEY> --api-secret <SECRET> --join --room conntest --identity tester --valid-for 1h`. 이 명령은 시크릿이 화면이나 기록에 남지 않게 실행한다. 환경변수 `LIVEKIT_API_KEY`와 `LIVEKIT_API_SECRET`를 그 세션에서만 설정하면 플래그를 생략할 수 있다.
   - 폰 LTE에서 [LiveKit 연결 테스트](https://livekit.io/connection-test)에 URL과 토큰을 넣고, **UDP 연결 성공** 여부를 기록한다. TCP로만 성공했다면 그렇게 적는다.
4. 부하 확인(선택): `lk load-test --url wss://voice.<도메인> --room loadtest --audio-publishers 8 --subscribers 40 --duration 1m`를 실행하고, CPU와 업로드 사용량을 작업 관리자로 기록한다. `lk` 설치를 승인받았을 때만 한다.
5. 재부팅 테스트: 재부팅하고 로그인하지 않은 상태에서 폰 LTE로 2번을 다시 확인한다.

## 10. 사용자에게 낼 보고서 (시크릿 제외)

- 도메인 `wss://voice.<도메인>`, 공인 IP, LAN IP
- 연 포트 목록(방화벽, 공유기)
- LiveKit과 Caddy 버전, 설치 경로, 자동 실행 방식(NSSM 또는 작업 스케줄러)
- 9장 결과: 로컬 OK, LTE OK, UDP 또는 TCP 연결, 부하 테스트 수치, 재부팅 후 자동 시작 여부
- API Key와 Secret이 있는 **파일 위치**(`C:\livekit\livekit.yaml`). 값은 적지 않는다.
- 남은 문제(TURN 필요 여부 등)

## 11. Mac 쪽 연결 (Windows 작업이 끝난 뒤 사용자 또는 Mac의 Kiro가 한다)

1. 사용자가 `livekit.yaml`의 Key와 Secret을 직접 복사해 Mac의 `~/mingle/.env.local`에 넣는다. 채팅으로 보내지 않는다.

```
LIVEKIT_URL=wss://voice.<도메인>
LIVEKIT_API_KEY=<KEY>
LIVEKIT_API_SECRET=<SECRET>
```

2. URL이 localhost가 아니면 `mingle-voice-agent/poc-server.ts`가 `/rtc` 프록시를 끄고, 테스트 페이지가 LiveKit에 직접 접속한다. 이때 `pnpm livekit`은 필요 없다.
3. Mac에서 `pnpm server`를 띄우고(사용자 확인 후), ngrok 4100 주소를 폰 두 대에서 연다. 한 대는 LTE로 접속해 실기기 테스트를 한다. 측정 항목은 `docs/voicetalk-hashrush-handoff.md` 8장에 있다.
4. 나중에 통역 에이전트를 Railway에 배포할 때도 같은 3개 환경변수를 쓴다. 에이전트는 이 PC로 아웃바운드로만 연결한다.
