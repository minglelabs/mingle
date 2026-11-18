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
- LiveKit 설정(`C:\livekit\livekit.yaml`)과 Caddy는 건드리지 않는다.
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
MINGLE_HAMZZI_WORKER=off
LIVEKIT_URL=wss://voice.minglelabs.app
LIVEKIT_API_KEY=<livekit.yaml keys: 의 키>
LIVEKIT_API_SECRET=<livekit.yaml keys: 의 시크릿>
```

`MINGLE_HAMZZI_WORKER=off`: 햄찌 자동 답장 워커도 Railway에서 돌고 있어서 여기서는 끈다.

### 실제로 쓰는 파일은 `~/hashchat/app.env.json`

`app.env`는 셸에서 불러올 수 없다. 공백이나 `<`, `>`가 들어간 값이 있고(예: `RESEND_FROM_EMAIL`), `APPLE_IAP_PRIVATE_KEY`, `FCM_PRIVATE_KEY`처럼 여러 줄인 값도 있다. 그래서 컨테이너와 빌드는 `app.env.json`(권한 600)을 쓴다.

`scripts/hashchat-win/hashchat-env.mjs`가 Railway 값(JSON)에서 `RAILWAY_*`를 빼고 위 값을 덮어써서 `app.env.json`을 만든다. 한 줄짜리 값만 모은 `app.env`도 같이 만든다(참고용).

```bash
cp ~/src/mingle/scripts/hashchat-win/*.mjs ~/src/mingle/scripts/hashchat-win/deploy.sh ~/hashchat/
railway variables --json > ~/hashchat/railway.json          # 출력하지 않는다
node ~/hashchat/hashchat-env.mjs ~/hashchat/railway.json ~/hashchat/app.env ~/hashchat/app.env.json ~/hashchat/app.env
rm ~/hashchat/railway.json
```

- `hashchat-env.mjs`는 LiveKit 키를 기존 `app.env`에서 가져온다. 처음이면 `app.env`에 `LIVEKIT_API_KEY=`, `LIVEKIT_API_SECRET=` 두 줄을 먼저 넣어 둔다.
- 스크립트는 키 개수와 여러 줄인 키의 이름만 출력한다.

## 3. 앱 서버 이미지 빌드와 실행

`NEXT_PUBLIC_*` 값은 빌드할 때 이미지에 박힌다. 그래서 `--build-arg`로 넘겨야 한다.
`app.env`를 `set -a; . app.env`로 불러오면 위 이유로 문법 오류가 나서 빌드가 시작되지 않는다. 대신 아래처럼 한다.

- 빌드: 빌드 인자 5개(`NEXT_PUBLIC_WS_PATH`, `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY`, `MINGLE_RELEASE_TARGET`, `NEXT_PUBLIC_HASH_RUSH_URL`, `NEXT_PUBLIC_HASH_RUSH_SERVER`)를 `app.env.json`에서 읽어 자식 프로세스 env에만 넣는다. `docker build`에는 `--build-arg 이름`만 넘긴다. 값은 명령줄과 로그에 남지 않는다.
- 실행: `~/hashchat/run-app.mjs`가 `app.env.json`의 모든 변수를 `-e 이름`으로만 넘긴다. 여러 줄 값도 그대로 들어간다. 포트 `127.0.0.1:8080`, 기본 bridge 네트워크, `--restart unless-stopped`.

이 절차는 `~/hashchat/deploy.sh`(`scripts/hashchat-win/deploy.sh`)가 그대로 한다. 7번을 본다.

처음 한 번 손으로 띄울 때:

```bash
cd ~/src/mingle
node ~/hashchat/run-app.mjs ~/hashchat/app.env.json hashchat-app:2.5.0   # 이미지는 deploy.sh가 만든 것
```

- `node`는 22 이상이 필요하다(`~/.nvm/versions/node/v22.9.0/bin/node`). WSL 기본 `/usr/bin/node`는 v10이라 안 된다.
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

## 5. Cloudflare 터널 (DNS는 이미 연결됨)

Cloudflare 터널 `hashchat-win`(id `8a108abc-b1b9-479e-9402-060569aca570`)이 이미 만들어져 있다. `hashchat-win.minglelabs.app`과 `hashrush-win.minglelabs.app`은 이 터널로 연결돼 있다.
Caddy, 공유기 포트 개방, A 레코드는 필요 없다. Caddy는 건드리지 않는다.

1. WSL 안에 `cloudflared`를 설치한다.
2. 터널 토큰은 Railway `hash-rush` 서비스의 `WINDOWS_CLOUDFLARED_TUNNEL_TOKEN`에 있다. 출력하지 말고 파일로만 받는다.

```bash
railway variables --service hash-rush --kv | grep '^WINDOWS_CLOUDFLARED_TUNNEL_TOKEN=' | cut -d= -f2- > ~/hashchat/tunnel.token
chmod 600 ~/hashchat/tunnel.token
```

3. `~/hashchat/cloudflared.yml`:

```yaml
ingress:
  - hostname: hashchat-win.minglelabs.app
    service: http://127.0.0.1:8080
  - hostname: hashrush-win.minglelabs.app
    service: http://127.0.0.1:8090
  - hostname: ssh-win.minglelabs.app
    service: ssh://127.0.0.1:22
  - service: http_status:404
```

- 지금은 `hashchat-tunnel` 컨테이너(`cloudflare/cloudflared`, `--network host`, `--restart unless-stopped`)가 이 파일을 `/etc/cloudflared/config.yml`로 읽기 전용 마운트해서 쓴다. 토큰은 `TUNNEL_TOKEN` 환경변수로 넘긴다.
- 파일을 고친 뒤에는 `cloudflared tunnel --config ~/hashchat/cloudflared.yml ingress validate`로 확인하고 `docker restart hashchat-tunnel`로 다시 읽힌다. 몇 초 동안 두 주소가 끊긴다.
- 파일은 제자리에서 고친다(`cat > 파일`). `sed -i`처럼 새 파일로 바꾸면 마운트가 옛 파일을 계속 볼 수 있다.

4. 실행하고, 재부팅해도 자동으로 뜨게 한다(systemd 서비스 또는 작업 스케줄러).

```bash
cloudflared tunnel --config ~/hashchat/cloudflared.yml run --token "$(cat ~/hashchat/tunnel.token)"
```

## 6. 확인 (모두 밖에서 접속해 확인)

- `curl https://hashchat-win.minglelabs.app/railway/health` → 200
- `curl -X POST https://hashchat-win.minglelabs.app/api/ios/v2.5.0/client/version-policy -H 'content-type: application/json' -d '{}'` → 200
- `curl https://hashrush-win.minglelabs.app/health` → `{"ok":true,...}`
- `wss://hashchat-win.minglelabs.app/stt`와 `/conversation-events`에 웹소켓 업그레이드가 되는지 확인한다.

## 7. 업데이트할 때

```bash
~/hashchat/deploy.sh <커밋>
```

`deploy.sh`가 하는 일:

1. `~/src/mingle`에 커밋 안 된 변경이 있거나 브랜치가 `feat/voicetalk-windows-livekit-mvp`가 아니면 멈춘다.
2. `git pull --ff-only` 후 HEAD가 인자로 준 커밋과 다르면 멈춘다. 아직 아무것도 바꾸지 않은 상태다.
3. 지금 이미지 `hashchat-app:2.5.0`에 `hashchat-app:2.5.0-prev` 태그를 붙인다.
4. 3번 방법으로 빌드한다. 빌드가 실패하면 컨테이너는 그대로 두고 멈춘다.
5. `hashchat-app` 컨테이너를 지우고 `run-app.mjs`로 다시 띄운다.
6. `http://127.0.0.1:8080/railway/health`가 2분 안에 200이 아니면 `2.5.0-prev`로 컨테이너를 다시 띄운다.
7. 마지막에 커밋, 이미지 ID, health 결과만 출력한다. 빌드 출력과 자세한 기록은 `~/hashchat/deploy-<시각>.log`(권한 600)에 남는다.

한 번에 하나만 돈다(`~/hashchat/.deploy.lock`).

## 8. Mac에서 SSH로 접속하기

공유기 포트는 열지 않는다. sshd는 WSL 안에서만 듣고, 밖에서는 Cloudflare 터널(`ssh-win.minglelabs.app`)로만 들어온다.

- `/etc/ssh/sshd_config.d/10-hashchat-win.conf`:

```
ListenAddress 127.0.0.1
ListenAddress ::1
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PermitRootLogin no
```

- 이 WSL은 systemd가 꺼져 있다. sshd는 `/etc/wsl.conf`의 `[boot] command`에 있는 `service ssh start`로 WSL이 켜질 때 뜬다.
- 터널 컨테이너가 `--network host`라서 `ssh://127.0.0.1:22`로 닿는다.
- 공개키는 `nam`의 `~/.ssh/authorized_keys`에 넣는다(`~/.ssh` 700, 파일 600).
- `ssh-win.minglelabs.app`의 DNS(터널로 가는 CNAME)는 Cloudflare 대시보드에서 만든다.

Mac의 `~/.ssh/config`:

```
Host hashchat-win
  HostName ssh-win.minglelabs.app
  User nam
  IdentityFile ~/.ssh/<공개키를 등록한 개인키>
  ProxyCommand cloudflared access ssh --hostname %h
```

Mac에도 `cloudflared`가 있어야 한다(`brew install cloudflared`). 그다음 `ssh hashchat-win '~/hashchat/deploy.sh <커밋>'`.
