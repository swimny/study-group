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

**추가된 컬럼(2026-07-10 이후):** `profile_password_hash` — 프로필(=유저)마다 개별 비밀번호를 갖도록 추가됨. 공유 비밀번호(앱 전체 게이트)와는 별개로, 본인 프로필을 수정/삭제할 때 이 비밀번호로 본인 확인을 함. 프로필 생성 시 같이 설정.

**설계 중 헷갈렸던 것:**
- PK는 자동 증가된다 — 생성 시 `id` 직접 안 넣어도 됨.
- 로그인 후 재접속 시 다시 로그인 안 되게 하려고 IP 기반 식별을 떠올렸는데, IP는 네트워크 위치일 뿐 사람을 특정 못 함(같은 와이파이, VPN, 모바일 IP 변경). 실제 해법은 프로필 선택 시 발급되는 **httpOnly JWT 쿠키** — 브라우저가 매 요청에 자동으로 실어 보내서 재로그인 없이 인식됨.

## `todo_categories`, `todos`

`todo_categories(id, user_id FK, name)` → `todos(id, user_id FK, category_id FK, title, completed, date)`. 카테고리를 문자열이 아니라 별도 테이블로 분리한 이유, `date`를 String이 아니라 `Date` 타입으로 한 이유는 각각 오타 방지/일관성, 스트릭 계산을 위한 날짜 연산 때문. PK에 `user_id`를 같이 묶을 필요는 없음 — PK는 "행을 유일하게 식별"하는 용도고, `user_id`로 빠르게 필터링하고 싶은 거면 그건 인덱스의 역할.

## `calendar_events`, `calendar_event_participants`

이벤트 자체(`calendar_events`: owner, 제목, `start_date`/`end_date`, 공개범위)와 "누가 이 이벤트를 자기 것으로 가져갔는지"(`calendar_event_participants`: event_id+user_id, todo 표시 여부/방식, **완료 여부**)를 분리했다. 완료 여부를 이벤트가 아니라 참여 테이블에 둔 이유: 전체공유 이벤트는 사람마다 완료 상태가 다를 수 있어서(모의면접 하나를 공유해도 각자 준비 체크는 따로).

**`event_type`(이벤트 종류: 면접/자격증시험/모의면접 등) 컬럼은 뺐다.** 처음 설계엔 있었는데, 실제로 써보니 필요 없다고 판단해서 제거함 — 캘린더 화면에서 종류별 구분 없이 제목/기간/공개범위만으로 충분했음.

`start_date`/`end_date`로 나눠서 여러 날에 걸친 일정(예: 며칠짜리 채용 전형)도 표현 가능. 캘린더 화면에서는 여러 날짜에 걸친 일정을 한 주 단위로 이어진 막대로 표시.

캘린더-Todo 연동은 `todos` 테이블에 실제 행을 만들지 않고, "오늘의 할 일" 조회 시 `todos` + `calendar_event_participants`를 API 레벨에서 합쳐서 보여주는 방식으로 결정 (todo가 "하루 단위"라는 모델을 깨지 않기 위해). **이 연동은 설계만 되어 있고 아직 실제로 Todo 화면과는 연결 안 함** (`show_as_todo` 필드가 있지만 미사용).

## `weekly_goals`

`weekly_goals(id, user_id FK, week_start_date, title, completed, created_at)` — 그 주에 달성하고 싶은 목표를 자유 텍스트로 적고 체크하는 간단한 구조. 대시보드에서 사용.

## `prep_items`, `prep_checklist_items`, `prep_resources` (준비노트)

`prep_items(id, user_id FK, title, item_type[cert/company/other], notes, completed, completed_at, position, created_at)` — 진행 중인 준비 항목(자격증/지원 회사/기타) 하나. `position`은 드래그 정렬용, `completed_at`은 포트폴리오 이관 시 달성일 기본값으로 씀.

하위에 `prep_checklist_items(id, prep_item_id FK, content, completed)`(체크리스트)와 `prep_resources(id, prep_item_id FK, title, url)`(참고자료 링크)가 딸림 — 둘 다 별도 PK를 가진 독립 테이블로 분리(문자열 배열 컬럼 대신), 각 항목을 개별로 체크/삭제해야 해서.

Todo와는 화면 느낌을 다르게 가고 싶어서 정사각형 타일 그리드 + `@dnd-kit` 드래그 정렬로 구현.

## `portfolio_profiles`, `portfolio_profile_links`, `portfolio_items`, `portfolio_links`

**`portfolio_profiles(id, user_id FK UNIQUE, school, major, gpa, enrollment_status[enrolled/on_leave/graduated/expected_graduation], intro)`** — 유저당 정확히 하나(1:1, `user_id`에 UNIQUE)만 존재하는 "포트폴리오 상단 프로필" 정보. 링크(GitHub 등)는 `portfolio_profile_links(id, portfolio_profile_id FK, title, url)`로 별도 테이블.

**`portfolio_items(id, user_id FK, title, item_type[certification/project/experience/award/other], description, achieved_date, source_prep_item_id nullable FK→prep_items, position, created_at)`** — 완료된 성과 항목(자격증 취득, 프로젝트 등) 여러 개. `source_prep_item_id`는 이 항목이 준비노트에서 이관되어 온 것이면 원본을 가리킴(중복 이관 방지 및 추적용), 직접 포트폴리오에 입력한 항목이면 `null`. 성과별 링크는 `portfolio_links(id, portfolio_item_id FK, title, url)`로 분리.

**준비노트 → 포트폴리오 이관:** 준비노트 항목이 `completed`되면 "포트폴리오로 보내기" 폼(종류+달성일 선택)이 뜨고, 보내면 `source_prep_item_id`로 연결된 `portfolio_items`가 생성되면서 `prep_resources`가 `portfolio_links`로 복사됨. 이미 보낸 항목은 "포트폴리오에서 보기" 링크로 바뀌어서 중복 전송을 막음.

## `feed_posts`, `feed_comments`, `feed_reactions` (소식)

원래 "피드"로 부르던 화면인데 이름을 "소식"으로 바꿈. `feed_posts(id, author_id FK, content, created_at, updated_at)` 하나에 댓글(`feed_comments`)과 이모지 반응(`feed_reactions`, `UNIQUE(post_id, user_id, emoji)`로 같은 이모지 중복 방지)이 딸리는 일반적인 게시판 구조. 회고+공지를 굳이 구분하지 않고 자유 텍스트 게시글 하나로 통일. 실시간성은 WebSocket 대신 15초 폴링(`refetchInterval`)으로 처리 — 이 정도 사용 규모엔 굳이 WebSocket 인프라를 둘 필요가 없다고 판단.

## 대시보드

스트릭(`current_streak`/`longest_streak`)과 활동 히트맵은 **`users` 테이블의 캐시 컬럼을 쓰지 않고, `todos.date`+`completed`에서 그때그때 계산**하는 방식으로 구현함(`/dashboard/streak`, `/dashboard/activity-heatmap`). `users`에 캐시 컬럼이 남아있긴 하지만 실제로 대시보드는 참조 안 함 — 나중에 캐시 컬럼을 아예 없애거나, 반대로 이 계산 결과를 캐시에 채워 넣는 식으로 정리가 필요함(아직 결정 안 함).

그 외 팀 전체의 오늘 완료율(`/dashboard/team-progress`)과 팀원들의 최근 포트폴리오 성과(`/dashboard/recent-portfolio-activity`)도 보여줌 — 대시보드가 "혼자 쓰는 투두 앱"처럼 느껴지지 않게, 여럿이 함께 쓴다는 느낌을 주는 위젯들.

## 인증

공유 비밀번호(환경변수에 bcrypt 해시로 저장) → 프로필 선택 → JWT 세션 쿠키, 2단계 토큰으로 구현:
- **gate 토큰** (5분): 비밀번호 통과 후, 프로필 목록 조회/선택/생성까지만 허용
- **session 토큰** (30일): 프로필 선택 후 발급, 이후 모든 요청에서 로그인 상태 유지. `token_version`을 실어 보내서, DB의 값이 바뀌면 그 토큰은 자동으로 무효화됨(강제 로그아웃 수단)

프론트(`/` 비밀번호 입력 → `/profile` 프로필 선택/생성 → `/todos`)까지 엔드투엔드로 동작 확인 완료. 로컬 개발 시 프론트-백엔드 쿠키가 오가려면 `127.0.0.1` 대신 **`localhost`로 주소를 통일**해야 함(브라우저가 `SameSite=Lax` 쿠키를 cross-site fetch에는 안 실어 보내는데, `127.0.0.1`과 `localhost`는 서로 다른 사이트로 취급됨).

**멀티테넌시 관련 결정:** 지금은 "서버 하나 = 그룹 하나" 구조. 다른 그룹이 쓰고 싶으면 레포를 그대로 재배포(다른 `.env`, 다른 DB)하는 방식으로 충분하다고 판단, "스터디방" 개념(하나의 서버에서 여러 그룹 운영)은 나중에 시간 남으면 검토하는 걸로 미룸.