# 마케팅 영상 동시 업로드 (/admin/social)

운영툴 더보기 → **영상 동시 업로드**. 영상 하나를 올리면 인스타그램 릴스·쓰레드·유튜브 쇼츠·틱톡 중 고른 곳에 한 번에 게시하고, 플랫폼별 링크·지표를 봅니다.

## 구조
- 계정: `app_marketing_social_accounts` (플랫폼당 1개, 토큰 AES-256-GCM 암호화). 워커가 자동 갱신.
  - 인스타·쓰레드: 60일 장기 토큰, 만료 7일 전 갱신 / 유튜브: refresh token / 틱톡: 24시간 토큰 + 365일 refresh token(1년마다 재연결).
- 영상: mp4, 최대 64MB·90초(15초 1080x1920이면 수 MB). 틱톡은 64MB 이하면 한 조각, 넘으면 10MB 조각으로 전송.
- 토큰 갱신: 플랫폼별 advisory lock(트랜잭션 범위)으로 직렬화 — 틱톡 refresh token 회전이 동시 갱신으로 꼬이지 않게. 복호화가 안 되는 토큰(키 변경)은 계정에 "다시 연결" 오류로 표시.
- 영상·커버: 공개 R2 버킷(프로필 버킷) `marketing-videos/` 아래. 인스타·쓰레드가 `video_url`로 직접 가져가야 해서 공개 URL이 필요.
- 게시: `app_marketing_video_targets` 상태 머신(queued → processing → published | failed). `src/server/marketing-social/worker.ts`가 15초마다 진행하며 플랫폼별 레인이 따로 돌아 유튜브 업로드가 인스타·쓰레드를 막지 않음. 일시 오류(429/5xx/네트워크)만 1·2·4·8분 뒤 재시도, 그 외(알 수 없는 오류 포함)는 실패 + 사유 표시, 화면에서 "다시 시도".
  - 유튜브: resumable 세션 URL을 먼저 저장하고 그 세션으로 이어 올림 → 재시작·시간 초과에도 쇼츠 중복 없음.
  - 인스타·쓰레드: 컨테이너가 이미 PUBLISHED면 다시 publish하지 않고 최근 게시물에서 캡션·시간으로 찾아 완료 처리.
- 지표: 게시 10분 뒤부터 2일간 1시간마다, 이후 30일까지 6시간마다 자동. 상세 화면에서 즉시 새로고침.

| 플랫폼 | 방식 | 지표 |
|---|---|---|
| 인스타그램 | Instagram API with Instagram Login (페이스북 페이지 불필요), REELS 컨테이너 → media_publish. 커버는 JPG만 | views, reach, likes, comments, shares, saved |
| 쓰레드 | Threads API, VIDEO 컨테이너 → threads_publish. 주제 태그 1개 | views, likes, replies, reposts+quotes+shares |
| 유튜브 | Data API v3 resumable upload (세로 3분 이하는 자동 쇼츠). 커버는 thumbnails.set 시도(쇼츠엔 미적용) | viewCount, likeCount, commentCount |
| 틱톡 | Content Posting API Direct Post, FILE_UPLOAD(도메인 인증 불필요). 커버 이미지 없음(1초 지점 프레임) | view/like/comment/share (공개 게시물만) |

## 사용자가 직접 할 일
1. **환경변수** (Railway): `.env.example`의 `MARKETING_SOCIAL_*`, 플랫폼별 ID/SECRET. `MARKETING_SOCIAL_PUBLIC_ORIGIN`은 운영툴 도메인(예: `https://<앱 도메인>`).
2. **리디렉션 URI 등록**: `<origin>/admin/social/api/oauth/{instagram|threads|youtube|tiktok}/callback` (운영툴 "계정 연결" 화면에 그대로 표시됨).
3. **인스타그램**: Meta 개발자 앱(Business 유형) → "Instagram" 제품의 *Instagram 로그인으로 API 설정*. 인스타 계정을 프로페셔널(비즈니스/크리에이터)로 전환. 앱 역할에 그 인스타 계정을 *Instagram 테스터*로 추가하면 심사 없이(Standard access) 우리 계정에 게시 가능. 다른 계정까지 쓰려면 `instagram_business_content_publish`, `instagram_business_manage_insights` 앱 심사.
4. **쓰레드**: 같은 Meta 앱 또는 별도 앱에 "Threads API" 사용 사례 추가, 쓰레드 테스터로 계정 추가 후 쓰레드 앱에서 초대 수락. 권한 `threads_basic`, `threads_content_publish`, `threads_manage_insights`.
5. **유튜브**: Google Cloud 프로젝트 → YouTube Data API v3 사용 설정 → OAuth 동의 화면(외부) → 웹 클라이언트 ID. 동의 화면을 **"프로덕션"으로 게시**해야 refresh token이 7일 만에 끊기지 않음(미인증 앱 경고는 본인 사용이면 무시 가능). 감사(audit) 전 프로젝트의 업로드는 **비공개로 잠김** → [YouTube API 서비스 감사 신청](https://support.google.com/youtube/contact/yt_api_form). 업로드 할당량은 일일 쿼터 내(하루 수 건이면 충분).
6. **틱톡**: TikTok for Developers 앱 → Login Kit + Content Posting API(Direct Post 켬) → 스코프 `user.info.basic`, `user.info.profile`, `video.publish`, `video.list` 앱 심사. 심사 통과 후에도 **Content Posting API audit 전에는 비공개(나만 보기) 계정에 SELF_ONLY로만** 게시됨 → audit 신청 후 공개 게시 가능.
7. 운영툴 → 영상 동시 업로드 → 계정 연결에서 4곳 "연결하기".
