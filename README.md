# studygroup — 설계 노트

테이블을 추가할 때마다 구조와 "왜 이렇게 했는지"를 짧게 기록한다.

## `users`

| 컬럼 | 타입 | 이유 |
|---|---|---|
| `id` | Integer PK | 다른 테이블이 FK로 참조할 대상. auto-increment라 직접 값 안 넣음 |
| `name` | String, UNIQUE | 프로필 선택 화면에 쓰는 값. 회원가입 아님 — 배포 시 팀원 3명을 미리 seed |
| `token_version` | Integer, default 0 | JWT는 서버가 강제로 무효화 못 함 → 이 값을 올리면 이전 토큰이 자동 무효화됨 |
| `current_streak` / `longest_streak` | Integer, default 0 | 매번 집계하기 무거워서 캐시. todo 완료 시점에 갱신 |
| `created_at` | DateTime | 디버깅용 |

**안 넣은 것:** `password`, `email` — 공유 비밀번호는 유저 소유가 아니라 앱 전체 게이트라 환경변수에 저장.

**설계 중 헷갈렸던 것:**
- PK는 자동 증가된다 — 생성 시 `id` 직접 안 넣어도 됨.
- 로그인 후 재접속 시 다시 로그인 안 되게 하려고 IP 기반 식별을 떠올렸는데, IP는 네트워크 위치일 뿐 사람을 특정 못 함(같은 와이파이, VPN, 모바일 IP 변경). 실제 해법은 프로필 선택 시 발급되는 **httpOnly JWT 쿠키** — 브라우저가 매 요청에 자동으로 실어 보내서 재로그인 없이 인식됨.

## `todo_categories`, `todos`

`todo_categories(id, user_id FK, name)` → `todos(id, user_id FK, category_id FK, title, completed, date)`. 카테고리를 문자열이 아니라 별도 테이블로 분리한 이유, `date`를 String이 아니라 `Date` 타입으로 한 이유는 각각 오타 방지/일관성, 스트릭 계산을 위한 날짜 연산 때문. PK에 `user_id`를 같이 묶을 필요는 없음 — PK는 "행을 유일하게 식별"하는 용도고, `user_id`로 빠르게 필터링하고 싶은 거면 그건 인덱스의 역할.

## `calendar_events`, `calendar_event_participants`

이벤트 자체(`calendar_events`: owner, 제목, 날짜, 종류, 공개범위)와 "누가 이 이벤트를 자기 것으로 가져갔는지"(`calendar_event_participants`: event_id+user_id, todo 표시 여부/방식, **완료 여부**)를 분리했다. 완료 여부를 이벤트가 아니라 참여 테이블에 둔 이유: 전체공유 이벤트는 사람마다 완료 상태가 다를 수 있어서(모의면접 하나를 공유해도 각자 준비 체크는 따로).

캘린더-Todo 연동은 `todos` 테이블에 실제 행을 만들지 않고, "오늘의 할 일" 조회 시 `todos` + `calendar_event_participants`를 API 레벨에서 합쳐서 보여주는 방식으로 결정 (todo가 "하루 단위"라는 모델을 깨지 않기 위해).

## 인증

공유 비밀번호(환경변수에 bcrypt 해시로 저장) → 프로필 선택 → JWT 세션 쿠키, 2단계 토큰으로 구현:
- **gate 토큰** (5분): 비밀번호 통과 후, 프로필 목록 조회/선택/생성까지만 허용
- **session 토큰** (30일): 프로필 선택 후 발급, 이후 모든 요청에서 로그인 상태 유지. `token_version`을 실어 보내서, DB의 값이 바뀌면 그 토큰은 자동으로 무효화됨(강제 로그아웃 수단)

프론트(`/` 비밀번호 입력 → `/profile` 프로필 선택/생성 → `/todos`)까지 엔드투엔드로 동작 확인 완료. 로컬 개발 시 프론트-백엔드 쿠키가 오가려면 `127.0.0.1` 대신 **`localhost`로 주소를 통일**해야 함(브라우저가 `SameSite=Lax` 쿠키를 cross-site fetch에는 안 실어 보내는데, `127.0.0.1`과 `localhost`는 서로 다른 사이트로 취급됨).

**멀티테넌시 관련 결정:** 지금은 "서버 하나 = 그룹 하나" 구조. 다른 그룹이 쓰고 싶으면 레포를 그대로 재배포(다른 `.env`, 다른 DB)하는 방식으로 충분하다고 판단, "스터디방" 개념(하나의 서버에서 여러 그룹 운영)은 나중에 시간 남으면 검토하는 걸로 미룸.