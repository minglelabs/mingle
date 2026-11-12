# HashChat 앱 서버를 Windows PC에서 돌리기 (2.5.0 테스트용)

2.5.0 TestFlight/내부 테스트 빌드는 Railway가 아니라 이 Windows PC를 본다.
DB는 그대로 prod(싱가포르 슈파베이스)를 쓴다. 즉 **prod 데이터를 쓰는 두 번째 앱 서버**다.

| 무엇 | 주소 | PC 안 포트 |
| --- | --- | --- |
| 앱 서버 (웹 + API + 메시징 + STT 중계 + 보이스톡 통역) | `https://hashchat-win.minglelabs.app` | 8080 |
| 해시러시 게임 서버 | `wss://hashrush-win.minglelabs.app` | 8090 |
| LiveKit (이미 있음) | `wss://voice.minglelabs.app` | 그대로 |

해시러시 페이지는 GitHub Pages(`https://minglelabs.github.io/hash-rush/`) 그대로 쓴다.

## 지켜야 할 것

- 비밀값(키, 비밀번호, DB 주소, 시크릿)을 화면이나 로그, 커밋에 출력하지 않는다. 있는지만 확인한다.
- **DB에는 스키마 변경을 하지 않는다.** `prisma migrate`와 `db push` 금지. 마이그레이션은 이미 적용돼 있다.
- **운영자 워커 4개는 반드시 끈다.** Railway에서 이미 돌고 있어서, 켜면 같은 작업이 두 번 실행된다.
- LiveKit 설정(`C:\livekit\livekit.yaml`)과 기존 Caddy의 `voice.minglelabs.app` 블록은 건드리지 않는다. 새 사이트 블록만 추가한다.
- 디스크: C 드라이브 여유가 9GB 정도뿐이다. 시작 전에 **20GB 이상** 확보한다(임시 파일, 휴지통, 안 쓰는 WSL 배포판, Windows.old 등). 그래도 안 되면 멈추고 보고한다. 지우기 전에 무엇을 지울지 사용자에게 먼저 물어본다.
- 메모리: ChatGPT 풀용 Chrome이 메모리를 많이 쓴다. `.wslconfig`에 `memory=6GB`를 걸어 WSL 상한을 둔다. Chrome은 사용자와 상의해서 줄인다.

## 1. 준비

1. WSL2 Ubuntu에 Docker Engine을 설치한다. Docker Desktop이 아니라 WSL 안의 `docker-ce`를 쓴다.
2. 재부팅해도 WSL의 Docker가 자동으로 뜨게 작업 스케줄러를 등록한다(로그온 시 `wsl -d Ubuntu -u root service docker start`).
3. WSL 안에 저장소를 받는다.
   - `minglelabs/mingle`: 브랜치 `feat/voicetalk-windows-livekit-mvp`
   - `minglelabs/hash-rush`: 브랜치 `main`

## 2. 환경변수 (`~/hashchat/app.env`, 권한 600)

Railway CLI로 prod 값을 받아 온다.

```bash
railway login                       # 브라우저 로그인은 사용자가 한다
railway link -p powerful-victory -e production -s mingle-2-0-0
railway variables --kv > ~/hashchat/app.env
chmod 600 ~/hashchat/app.env
```

그다음 아래처럼 고친다.

- **지운다**: `RAILWAY_`로 시작하는 줄 전부
- **바꾸거나 넣는다**:

```
PORT=8080
NEXT_PUBLIC_SITE_URL=https://hashchat-win.minglelabs.app
NEXTAUTH_URL=https://hashchat-win.minglelabs.app
NEXT_PUBLIC_HASH_RUSH_SERVER=wss://hashrush-win.minglelabs.app
MINGLE_OPERATOR_POST_WORKER=off
MINGLE_OPERATOR_AUTO_REPLY_WORKER=off
MINGLE_OPERATOR_POST_RESERVE_WORKER=off
MINGLE_OPERATOR_AUTOMATION_WORKER=off
LIVEKIT_URL=wss://voice.minglelabs.app
LIVEKIT_API_KEY=<livekit.yaml keys: 의 키>
LIVEKIT_API_SECRET=<livekit.yaml keys: 의 시크릿>
```

## 3. 앱 서버 이미지 빌드와 실행

`NEXT_PUBLIC_*` 값은 빌드할 때 이미지에 박힌다. 그래서 `--build-arg`로 넘겨야 한다.

```bash
cd ~/src/mingle
set -a; . ~/hashchat/app.env; set +a
docker build -f Dockerfile.railway -t hashchat-app:2.5.0 \
  --build-arg NEXT_PUBLIC_WS_PATH="$NEXT_PUBLIC_WS_PATH" \
  --build-arg NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY="$NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY" \
  --build-arg MINGLE_RELEASE_TARGET="$MINGLE_RELEASE_TARGET" \
  --build-arg NEXT_PUBLIC_HASH_RUSH_URL="$NEXT_PUBLIC_HASH_RUSH_URL" \
  --build-arg NEXT_PUBLIC_HASH_RUSH_SERVER="$NEXT_PUBLIC_HASH_RUSH_SERVER" .
docker builder prune -f            # 빌드 캐시 정리(디스크)
docker run -d --name hashchat-app --restart unless-stopped \
  --env-file ~/hashchat/app.env -p 127.0.0.1:8080:8080 hashchat-app:2.5.0
```

- 컨테이너 안의 통역 서버는 `wss://voice.minglelabs.app`에 접속한다. 같은 PC로 되돌아오는 연결(헤어핀 NAT)이 막히면 `--add-host voice.minglelabs.app:<Windows 호스트 IP>`를 붙여 다시 띄운다.
- 확인 방법: `docker logs hashchat-app`에 `mingle-voice-agent not started`가 없어야 한다.

## 4. 해시러시 게임 서버

`~/hashchat/hashrush.env` (권한 600):

```
PORT=8090
HASH_RUSH_TICKET_SECRET=<app.env의 HASH_RUSH_TICKET_SECRET와 같은 값>
RESULTS_SECRET=<app.env의 HASH_RUSH_RESULTS_SECRET와 같은 값>
RESULTS_URL=https://hashchat-win.minglelabs.app/api/hash-rush/results
ALLOWED_ORIGINS=https://minglelabs.github.io
```

```bash
cd ~/src/hash-rush
docker build -f server/Dockerfile -t hashrush-server .
docker run -d --name hashrush --restart unless-stopped \
  --env-file ~/hashchat/hashrush.env -p 127.0.0.1:8090:8090 hashrush-server
```

## 5. Caddy와 DNS

1. DNS: Cloudflare에서 `hashchat-win`과 `hashrush-win` A 레코드를 `voice.minglelabs.app`과 같은 공인 IP로 만든다. 프록시는 끄고 DNS only로 한다. 이건 사용자가 한다.
2. 기존 Caddyfile에 블록 두 개를 추가하고 reload한다.

```
hashchat-win.minglelabs.app {
    reverse_proxy 127.0.0.1:8080
}
hashrush-win.minglelabs.app {
    reverse_proxy 127.0.0.1:8090
}
```

## 6. 확인 (모두 밖에서 접속해 확인)

- `curl https://hashchat-win.minglelabs.app/railway/health` → 200
- `curl -X POST https://hashchat-win.minglelabs.app/api/ios/v2.5.0/client/version-policy -H 'content-type: application/json' -d '{}'` → 200
- `curl https://hashrush-win.minglelabs.app/health` → `{"ok":true,...}`
- `wss://hashchat-win.minglelabs.app/stt`와 `/conversation-events`에 웹소켓 업그레이드가 되는지 확인한다.

## 7. 업데이트할 때

```bash
git pull
docker build ...       # 3번과 같은 명령
docker rm -f hashchat-app
docker run ...         # 3번과 같은 명령
```
