# studygroup 프로젝트 인수인계

## 프로젝트 개요
- 취업 준비 스터디그룹(3인, 추가 가능) 전용 웹앱. 목적은 지식 공유가 아니라 **동기부여/책임감(accountability)** — 서로 다른 분야를 준비하는 팀원들이 서로의 진행 상황을 보면서 지속하게 만드는 도구.
- 학습 목적의 개인 프로젝트. **코드를 던져주지 말고 같이 판단하며 진행**하는 방식으로 작업해왔음 (아래 "협업 방식" 참고).
- 저장소 루트: `C:\Users\rlatn\Desktop\studygroup` (`backend/`, `frontend/`)

## 기술 스택
- 프론트엔드: Next.js 16(App Router) + TypeScript + Tailwind v4 + shadcn/ui + TanStack Query
- 백엔드: FastAPI + SQLAlchemy + Pydantic, 개발 DB는 SQLite(`backend/studygroup.db`), 운영은 PostgreSQL 예정(아직 미전환)
- 배포: Docker Compose + Vercel + AWS 예정이지만 **아직 손 안 댐**
- Alembic 마이그레이션도 아직 안 씀 — 지금까지는 스키마 바뀔 때마다 `studygroup.db` 삭제 후 재생성으로 처리해왔음 (아래 주의사항 참고)

## 인증 모델
- 회원가입 없음. 공유 비밀번호(해시는 `backend/.env.local`의 `APP_PASSWORD_HASH`) → 프로필 선택/생성 → 세션 유지, 2단계 JWT 쿠키:
  - **gate 토큰**(5분): 비밀번호 통과 후, 프로필 목록 조회/선택/생성까지만 허용
  - **session 토큰**(30일): 프로필 선택 후 발급, `user_id`+`token_version` 포함. `token_version` 올리면 강제 로그아웃 가능
- 프로필(=유저)마다 **개별 비밀번호**(`profile_password_hash`)가 있어서, 본인 프로필 수정/삭제 시 그 비밀번호 확인 필요. 생성 시 함께 설정.
- 비밀번호 해시는 `backend/scripts/hash_password.py`로 사용자가 직접 생성(평문이 대화 로그에 안 남게).
- `JWT_SECRET_KEY`도 `.env.local`에 있음(랜덤 생성, 민감도 낮음).

## DB 스키마 (지금까지 만든 것)
- `users`: id, name(unique), profile_password_hash, token_version, current_streak, longest_streak, created_at
- `todo_categories`: id, user_id FK, name — 유저별 소유, 날짜 개념 없음(계속 유지되는 분류)
- `todos`: id, user_id FK, category_id FK, title, completed, date(Date 타입)
- `calendar_events`: id, owner_id FK, title, start_date, end_date, visibility(enum: private/shared) — **event_type(카테고리) 없음**, 사용자가 빼자고 해서 제거함
- `calendar_event_participants`: id, event_id FK, user_id FK, show_as_todo, display_mode(enum: daily/day_of), completed — UNIQUE(event_id, user_id). 캘린더 이벤트를 Todo에 노출시킬지 설정하는 테이블인데, **아직 실제로 Todo 화면과 연동은 안 함** (설계만 하고 구현 스킵)
- `prep_items`: id, user_id FK, title, item_type(enum: cert/company/other), notes, completed, completed_at, position(드래그 정렬용), created_at
- `prep_checklist_items`: id, prep_item_id FK, content, completed
- `prep_resources`: id, prep_item_id FK, title, url
- `portfolio_profiles`: id, user_id FK(unique, 1:1), school, major, gpa, enrollment_status(enum: enrolled/on_leave/graduated/expected_graduation), intro — 유저당 하나뿐인 "포트폴리오 상단 프로필" 정보
- `portfolio_profile_links`: id, portfolio_profile_id FK, title, url — 프로필에 붙는 링크(GitHub 등)
- `portfolio_items`: id, user_id FK, title, item_type(enum: certification/project/experience/award/other), description, achieved_date, source_prep_item_id(nullable FK→prep_items), position(드래그 정렬용), created_at
- `portfolio_links`: id, portfolio_item_id FK, title, url — 개별 성과 항목에 붙는 링크

**아직 설계 안 한 테이블**: `daily_activity`, `weekly_goals`, `feed_posts`/`feed_comments`/`feed_reactions`, `agent_runs`/`agent_messages`

## 백엔드 구조
- `app/main.py`: CORS(`http://localhost:3000`만 허용) + 라우터 등록
- `app/core/security.py`: bcrypt 해시/검증, JWT 발급/디코드, `get_current_user` 의존성(세션 쿠키 → 유저 객체)
- `app/database.py`: engine/SessionLocal/`get_db`
- `app/models/*.py`: 위 테이블별 SQLAlchemy 모델
- `app/routers/auth.py`: `/auth/login`, `/auth/profiles`(GET/POST), `/auth/profiles/{id}`(PATCH/DELETE), `/auth/select-profile`
- `app/routers/users.py`: `/me`, `/users` (세션 기준 내 정보/전체 유저 목록 — 캘린더에서 "누가 만들었는지" 표시할 때 씀)
- `app/routers/todos.py`: `/todo-categories`, `/todos` 전체 CRUD, 본인 것만 필터링
- `app/routers/calendar.py`: `/calendar-events`(연/월 쿼리로 필터), `/calendar-event-participants`
- `app/routers/prep_notes.py`: `/prep-items`(+중첩 checklist/resources), `/prep-items/reorder`, `/checklist-items/*`, `/resources/*`
- `app/routers/portfolio.py`: `/portfolio-items`(GET/POST, +중첩 links), `/portfolio-items/reorder`, `/portfolio-items/{id}`(PATCH/DELETE), `/portfolio-items/{id}/links`(POST), `/links/{id}`(DELETE), `/portfolio-profile`(GET/PATCH), `/portfolio-profile/links`(POST), `/profile-links/{id}`(DELETE)

## 프론트엔드 구조
- `app/page.tsx`: 비밀번호 입력(첫 화면)
- `app/profile/page.tsx`: 프로필 선택/생성/수정/삭제
- `app/(app)/layout.tsx` + `components/app-nav.tsx`: 로그인 후 공용 레이아웃(왼쪽 사이드바: 대시보드/캘린더/Todo/피드/준비노트/포트폴리오)
- `app/(app)/todos/page.tsx`: 완성. 카테고리별 그룹, 체크박스 토글, 인라인 추가/수정/삭제
- `app/(app)/calendar/page.tsx`: 완성. 월간 그리드 직접 구현(FullCalendar 등 라이브러리 안 씀), 여러 날 일정은 주 단위로 이어진 막대로 표시, 토요일=파란 글씨/일요일=빨간 글씨, 연/월 직접 선택 가능
- `app/(app)/prep-notes/page.tsx`: 완성. 정사각형 타일 그리드(Todo와 다른 느낌 요구받아서 이렇게 함) + `@dnd-kit`으로 드래그 정렬 + 클릭하면 하단에 상세(메모/체크리스트/자료) 패널
- `app/(app)/portfolio/page.tsx`: 완성. 상단에 프로필 카드(학교/전공/학점/재학상태/한줄소개/링크, 수정 가능) + 아래에 성과 항목 목록(자격증/프로젝트/경험/수상/기타, `@dnd-kit` 드래그 정렬, 각 항목에 링크 추가 가능)
- **준비노트 → 포트폴리오 이관 완성됨**: `prep-notes` 페이지에서 항목이 `completed`면 "포트폴리오로 보내기" 폼(종류+달성일 선택)이 뜨고, 보내면 `source_prep_item_id`로 연결된 `portfolio_items`가 생성되면서 준비노트의 자료(`prep_resources`)가 포트폴리오 링크로 같이 복사됨. 이미 보낸 항목은 "포트폴리오에서 보기" 링크로 바뀜(중복 전송 방지).
- `app/(app)/dashboard`, `feed`: **아직 placeholder만 있음**
- `lib/api.ts`: `apiFetch` 공용 fetch 래퍼(`credentials: include`, `ApiError` 클래스)
- `lib/date.ts`: `toDateKey`, `getTodayKey`, `getMonthGrid`, `chunkIntoWeeks`
- `lib/useClickOutside.ts`: 빈 곳 클릭하면 열린 폼/패널 닫히는 공용 훅. Todo/캘린더/준비노트/프로필 화면 전부에 적용해둠
- 테마: `app/globals.css`에서 진하고 채도 높은 사파이어 블루 계열로 커스터마이징(oklch 값 직접 조정함, 처음엔 너무 연했다/남색 같았다/너무 진했다 등 여러 번 조정 거쳤음)

## ⚠️ 알아둬야 할 함정들
1. **개발 서버가 파일 변경을 놓칠 때가 있음** (uvicorn `--reload`, next dev 둘 다 겪음). 코드 수정 후 사용자에게 테스트해보라고 하기 전에 **완전히 프로세스 kill 후 재시작**, 프론트는 `.next` 캐시도 지우고(`rm -rf .next`) 재시작하는 걸 기본으로 할 것. 로그에 "Reloading..." 안 뜨면 반영 안 된 것.
2. **스키마(모델 컬럼) 바꾸면 SQLite DB를 지워야 함** — `create_all`은 없는 테이블만 만들고 기존 테이블 ALTER는 안 해줌. `studygroup.db` 지우면 **기존 로그인 세션이 다 깨지니까(유저 자체가 사라짐), 사용자에게 다시 로그인(비밀번호+프로필 선택/생성)하라고 안내할 것.** 이거 두 번 정도 겪었고 "버튼이 안 눌린다"는 착각을 유발했음(실제로는 401이 조용히 나는 것).
3. **프론트 API 호출 주소는 `http://localhost:8000`, `127.0.0.1:8000` 쓰면 안 됨** — SameSite=Lax 쿠키가 `localhost`와 `127.0.0.1`을 다른 사이트로 취급해서 인증이 깨짐.
4. 백엔드 검증은 실제 로그인 없이도, `.env.local`의 `JWT_SECRET_KEY`로 `create_session_token(user_id, 0)`을 직접 호출해서 테스트용 세션 쿠키를 만들어 curl로 검증 가능(비밀번호 몰라도 됨). 여러 번 이렇게 검증했음.
5. **모든 생성/수정 폼에 에러가 화면에 안 보이는 문제가 반복적으로 있었음.** 몇 군데는 에러 메시지 붙였지만(카테고리/할일 추가 등의 유효성 검사 에러), **네트워크/인증 실패 시 에러를 보여주는 처리는 아직 전체적으로 안 되어 있음.** 다음에 손대면 좋을 부분.
6. **새 라우터를 추가했는데 서버 재시작해도 `/openapi.json`/`/docs`에 안 뜨는 문제 (2026-07-23, Windows).** 원인: 예전에 켜뒀던 uvicorn 프로세스가 안 죽고 8000번 포트를 계속 잡고 있어서, 새로 켠 서버는 실제로 요청을 못 받고 옛날 프로세스가 계속 응답하고 있었음. `netstat -ano | findstr :8000`으로 포트 잡은 PID 확인했는데, 터미널에 뜬 `Started server process [PID]`랑 실제로 포트 잡은 PID가 서로 달랐던 게 결정적 단서. 게다가 `Get-Process -Id`로 확인하면 이미 죽은 PID인데도 `netstat`엔 한동안 남아있어서 더 헷갈렸음. **해결:** `Stop-Process -Name python -Force -ErrorAction SilentlyContinue`로 python 프로세스를 통째로 다 죽이고, `Get-Process -Name python`으로 완전히 없어졌는지 확인한 뒤 uvicorn을 다시 하나만 켜니 해결됨. **교훈:** 라우터 추가 후 반영이 안 되는 것 같으면 `--reload`를 믿지 말고, python 프로세스를 전부 죽였다가 하나만 새로 켜서 확인할 것.
7. **PowerShell `Invoke-RestMethod -Headers @{Cookie=...}`로 세션 쿠키 인증 테스트가 안 됨 ("로그인이 필요합니다" 401).** `Invoke-RestMethod`가 `-Headers`에 넘긴 `Cookie` 값을 실제로 안 실어 보내는 문제. **해결:** `New-Object Microsoft.PowerShell.Commands.WebRequestSession`으로 세션 객체를 만들고 `System.Net.Cookie`를 등록한 뒤 `-WebSession`으로 넘기면 정상 동작.
8. **Gemini API 모델명 `gemini-2.5-flash`가 404 에러.** 응답: `"This model models/gemini-2.5-flash is no longer available to new users."` — 신규 발급 키에는 막힌 구모델이었음. **해결:** `gemini-3.5-flash`로 교체.
9. **PowerShell에서 `python -c "..."`에 큰따옴표/작은따옴표를 섞어 넣으면 인자가 깨짐 (`SyntaxError: unterminated string literal` 등).** Windows PowerShell이 네이티브 exe(`python.exe`)로 인자를 넘길 때 따옴표 escape가 기대한 대로 안 됨(여러 조합 다 시도했지만 계속 깨짐). **해결:** inline `-c` 대신 `.py` 스크립트 파일을 만들어서 `python scripts\파일명.py`로 실행. **교훈:** PowerShell + `python -c` + 따옴표 중첩 조합은 애초에 시도하지 말고 바로 스크립트 파일로 갈 것.
10. **오늘 할일이 0개일 때 코칭 캐릭터가 "이미 다 완료했어요!"라고 말하는 버그.** 프롬프트에 "오늘 할일 0/0개 완료"라는 문구를 그대로 넣었더니 Gemini가 0/0을 100% 완료로 해석해서 생김. **해결:** `coaching.py`의 `_build_context_summary`에서 할일이 0개인 경우를 따로 분기해서 "오늘 등록된 할일이 아직 없음"으로 명시.

## 협업 방식 (지켜온 규칙)
- 사용자는 데이터사이언스 전공, AI/백엔드 학습 중. **혼자 설계하고 코드를 던지지 말고, 제안 → 사용자 검토/결정 → 그 다음에 코드 작성** 순서로 진행해왔음.
- 예외: **순수 보일러플레이트(설정, 재시작, 이미 합의된 CRUD 반복 패턴)는 바로 작성**해도 됨. **설계 결정(스키마 컬럼, 화면 구성, 기능 범위)은 먼저 제안하고 이유를 설명한 뒤, 사용자가 확정하면 코드로 옮기는** 식으로 계속 진행했음.
- 화면/스타일 피드백은 세밀한 반복 조정으로 들어옴(색상 hex/oklch 값, 픽셀 단위 여백 등) — 정확한 값으로 빠르게 반영하는 걸 선호함.
- 멀티테넌시("스터디방" — 여러 그룹이 한 서버 공유) 아이디어는 논의했지만 **지금은 안 하기로 결정**(서버 하나=그룹 하나, 재배포로 대응). 나중에 여유 있으면 검토.

## 다음에 할 일 (우선순위 순, 사용자와 합의된 순서)
1. **피드** — 다음 차례. 회고+공지 통합, 댓글/리액션, 폴링 기반 준실시간(WebSocket 아님). `feed_posts`/`feed_comments`/`feed_reactions` 테이블 설계부터 시작(아직 안 함).
2. **대시보드** — 의도적으로 마지막으로 미룸. 이유: 사용자가 "이 앱이 그냥 투두 체크 앱처럼 느껴질까봐" 걱정했고, 대시보드가 로그인 후 첫 화면이라 여기 구성이 앱의 첫인상을 좌우한다고 판단함. 개인별 통계 카드 3개(오늘 완료율/스트릭/주간목표)만 나열하지 말고, **피드 미리보기·공유 일정 미리보기·팀 최근 성과(포트폴리오) 알림** 같은 "여럿이 공유한다"는 느낌을 주는 위젯을 넣기로 함 — 피드가 있어야 그 미리보기가 되니, 피드 먼저 만들고 대시보드로 돌아오기로 함.
   - 스트릭 계산 로직(언제/무슨 조건으로 `current_streak` 올리고 리셋할지)도 아직 안 정함 — 대시보드 만들 때 같이 정해야 함.
   - `weekly_goals` 테이블도 이때 같이 설계.
3. **AI 에이전트** (동기부여 코칭 매일 + 주간 리포트) — 손도 안 댐. LLM function calling 기반으로 하기로 했었음.
4. 위 화면들 다 되면: 캘린더-Todo 연동(`show_as_todo` 실제 사용, 지금은 설계만 있고 미구현), 에러 표시 일관성 개선(네트워크/인증 실패 시 화면에 에러 안 뜨는 곳들), Alembic 마이그레이션 전환, Docker Compose/배포.

## 진행 방식 요청
새 세션에서도 위 "협업 방식"을 유지해줘 — 피드 테이블 설계부터 "제안 → 검토 → 확정 → 코드" 순서로 시작하면 됨.