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
- `users`: id, name(unique), profile_password_hash, token_version, current_streak, longest_streak, created_at — **주의**: `current_streak`/`longest_streak`는 대시보드가 실제로 안 씀 (아래 참고), 정리 필요
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
- `feed_posts`: id, author_id FK, content, created_at, updated_at — "피드"에서 "소식"으로 화면 이름 변경됨
- `feed_comments`: id, post_id FK, author_id FK, content, created_at
- `feed_reactions`: id, post_id FK, user_id FK, emoji — UNIQUE(post_id, user_id, emoji)
- `weekly_goals`: id, user_id FK, week_start_date, title, completed, created_at
- **`coaching_messages`** (AI 코칭 캐릭터, 2026-07-23 추가): id, user_id FK, screen_context(enum: dashboard/todos/calendar/prep_notes), role(enum: assistant/user), content, date, created_at
- **`weekly_reports`** (AI 주간 리포트, 2026-07-24 생성 로직/라우터/자동화까지 완성): id, week_start_date(UNIQUE), team_summary, created_at
- **`weekly_report_member_summaries`**: id, weekly_report_id FK, user_id FK, summary

**아직 설계 안 한 테이블**: `daily_activity`, `agent_runs`/`agent_messages`(필요하면)

## AI 에이전트 (2026-07-23 시작, LLM은 **Gemini**, Claude/Anthropic 아님)
- **LLM 선택 이유**: 사용자가 개인 자금이 매우 적어서(카드 등록 없이 쓸 수 있는) 무료 티어가 필요했음 → Google Gemini API로 결정. `backend/app/core/gemini_client.py`에 `generate_text()` 하나로 감싸둠. 모델명은 `gemini-3.5-flash` (처음 `gemini-2.5-flash`로 했다가 "신규 사용자에게 더 이상 제공 안 함" 404 떠서 교체함 — 아래 함정 8번 참고).
- **코칭 캐릭터 (1단계: 대화만, function calling 없음) — 완성됨.**
  - 화면 하단에 떠다니는 캐릭터(지금은 🐥 이모지 placeholder, 나중에 이미지로 교체 예정). 클릭하면 대화 패널.
  - 화면(대시보드/Todo/캘린더/준비노트)에 처음 들어갈 때 그날 그 화면용 메시지가 없으면 Gemini 호출해서 새로 만들고(하루 1번), 있으면 재사용 — `backend/app/routers/coaching.py`의 `GET /coaching-messages`.
  - 사용자가 캐릭터한테 말 걸면 `POST /coaching-messages`로 대화 이어감(자유, 횟수 제한 없음). **지금은 진짜 대화만 하고, 실제로 Todo 추가 같은 액션 실행은 안 함 — 2단계로 명시적으로 미뤄둔 것.**
  - 프롬프트/상황요약 로직은 `coaching.py`의 `SYSTEM_PROMPT` + `_build_context_summary()`에 있음 (agent-worker 아님 — 코칭 캐릭터는 화면 열 때 즉석 생성이라 상시 프로세스 필요 없음).
- **주간 리포트 (2026-07-24 완성).** `agent-worker`라는 별도 폴더는 안 만들고 `backend/scripts/`에 넣음(규모상 과함 판단).
  - `backend/scripts/generate_weekly_report.py`: 이번 주(월~일) 팀원별 `todos`/`weekly_goals`/`portfolio_items`/`prep_items` 활동을 모아 Gemini로 팀원별 요약 생성 → 그 요약들을 모아 팀 전체 격려 요약 한 번 더 생성 → `weekly_reports`/`weekly_report_member_summaries`에 저장. 같은 주에 재실행하면 기존 리포트 지우고 재생성(테스트/재시도용). 활동이 0건인 팀원은 "활동 없음"을 사실대로 프롬프트에 넣어서 코칭 캐릭터 0/0 버그(함정 10번) 재발 방지.
  - `backend/app/routers/weekly_report.py`: `GET /weekly-reports/latest` — 가장 최근 주 리포트 조회, 없으면 404.
  - 프론트 `components/weekly-report-banner.tsx`: `feed` 페이지 최상단에 고정 표시. 리포트 없으면 아무것도 안 그림.
  - `backend/scripts/run_weekly_report.bat` + Windows 작업 스케줄러(`StudyGroupWeeklyReport` 태스크, 매주 일요일 밤 11시)로 자동 실행 등록 완료. **단, PC가 그 시간에 켜져 있고 로그인돼 있어야 실행됨**(절전 중이면 안 돌아감 — "깨워서 실행" 옵션은 아직 안 켬). 실행 로그는 `backend/scripts/weekly_report.log`.
  - **이건 "에이전트"가 아니라 "LLM 호출이 들어간 자동화 스크립트"임을 명확히 함(2026-07-24 논의)** — 무엇을 조회할지/언제 실행할지/결과를 어디 저장할지 전부 코드가 결정하고 Gemini는 텍스트 생성만 함. Function calling도, 자율 판단 루프도 없음. 코칭 캐릭터 1단계와 같은 급.
- **참고 프로젝트**: `C:\Users\rlatn\Desktop\pusan-clone` — 카카오테크캠퍼스 "Kanana 일정 Agent" 수업 과제 레포. LangChain + Gradio + GPT계열 프록시라 직접 재사용은 안 되지만, **2단계(function calling)** 만들 때 tool 정의 방식 참고용으로 남겨둠.

## 백엔드 구조
- `app/main.py`: CORS(`http://localhost:3000`만 허용) + 라우터 등록
- `app/core/security.py`: bcrypt 해시/검증, JWT 발급/디코드, `get_current_user` 의존성(세션 쿠키 → 유저 객체)
- `app/core/gemini_client.py`: Gemini API 호출 공용 wrapper
- `app/database.py`: engine/SessionLocal/`get_db`
- `app/models/*.py`: 위 테이블별 SQLAlchemy 모델
- `app/routers/auth.py`: `/auth/login`, `/auth/profiles`(GET/POST), `/auth/profiles/{id}`(PATCH/DELETE), `/auth/select-profile`
- `app/routers/users.py`: `/me`, `/users` (세션 기준 내 정보/전체 유저 목록 — 캘린더에서 "누가 만들었는지" 표시할 때 씀)
- `app/routers/todos.py`: `/todo-categories`, `/todos` 전체 CRUD, 본인 것만 필터링
- `app/routers/calendar.py`: `/calendar-events`(연/월 쿼리로 필터), `/calendar-event-participants`
- `app/routers/prep_notes.py`: `/prep-items`(+중첩 checklist/resources), `/prep-items/reorder`, `/checklist-items/*`, `/resources/*`
- `app/routers/portfolio.py`: `/portfolio-items`(GET/POST, +중첩 links), `/portfolio-items/reorder`, `/portfolio-items/{id}`(PATCH/DELETE), `/portfolio-items/{id}/links`(POST), `/links/{id}`(DELETE), `/portfolio-profile`(GET/PATCH), `/portfolio-profile/links`(POST), `/profile-links/{id}`(DELETE)
- `app/routers/feed.py`: `/feed-posts`(GET/POST/PATCH/DELETE), `/feed-posts/{id}/comments`, `/comments/{id}`(DELETE), `/feed-posts/{id}/reactions`
- `app/routers/weekly_goals.py`: `/weekly-goals`(GET/POST/PATCH/DELETE)
- `app/routers/dashboard.py`: `/dashboard/streak`(그때그때 Todo에서 계산, `users.current_streak` 캐시 컬럼 안 씀), `/dashboard/activity-heatmap`, `/dashboard/team-progress`, `/dashboard/recent-portfolio-activity`
- `app/routers/coaching.py`: `/coaching-messages`(GET/POST) — 위 "AI 에이전트" 섹션 참고
- `app/routers/weekly_report.py`: `GET /weekly-reports/latest` — 위 "AI 에이전트" 섹션의 주간 리포트 참고
- `scripts/clear_today_coaching.py`: 테스트용 — 오늘자 코칭 메시지 지우고 새 프롬프트로 재생성해보고 싶을 때 씀
- `scripts/generate_weekly_report.py` / `scripts/run_weekly_report.bat`: 주간 리포트 생성 스크립트 + 스케줄러용 실행 래퍼(위 "AI 에이전트" 섹션 참고)

## 프론트엔드 구조
- `app/page.tsx`: 비밀번호 입력(첫 화면)
- `app/profile/page.tsx`: 프로필 선택/생성/수정/삭제
- `app/(app)/layout.tsx` + `components/app-nav.tsx`: 로그인 후 공용 레이아웃(왼쪽 사이드바: 대시보드/캘린더/Todo/소식/준비노트/포트폴리오) + `components/coaching-character.tsx` 마운트
- `app/(app)/todos/page.tsx`: 완성. 카테고리별 그룹, 체크박스 토글, 인라인 추가/수정/삭제
- `app/(app)/calendar/page.tsx`: 완성. 월간 그리드 직접 구현(FullCalendar 등 라이브러리 안 씀), 여러 날 일정은 주 단위로 이어진 막대로 표시, 토요일=파란 글씨/일요일=빨간 글씨, 연/월 직접 선택 가능
- `app/(app)/prep-notes/page.tsx`: 완성. 정사각형 타일 그리드(Todo와 다른 느낌 요구받아서 이렇게 함) + `@dnd-kit`으로 드래그 정렬 + 클릭하면 하단에 상세(메모/체크리스트/자료) 패널
- `app/(app)/portfolio/page.tsx`: 완성. 상단에 프로필 카드(학교/전공/학점/재학상태/한줄소개/링크, 수정 가능) + 아래에 성과 항목 목록(자격증/프로젝트/경험/수상/기타, `@dnd-kit` 드래그 정렬, 각 항목에 링크 추가 가능)
- **준비노트 → 포트폴리오 이관 완성됨**: `prep-notes` 페이지에서 항목이 `completed`면 "포트폴리오로 보내기" 폼(종류+달성일 선택)이 뜨고, 보내면 `source_prep_item_id`로 연결된 `portfolio_items`가 생성되면서 준비노트의 자료(`prep_resources`)가 포트폴리오 링크로 같이 복사됨. 이미 보낸 항목은 "포트폴리오에서 보기" 링크로 바뀜(중복 전송 방지).
- `app/(app)/dashboard/page.tsx`: 완성. 스트릭/활동 히트맵, 팀 전체 오늘 완료율, 팀원 최근 포트폴리오 성과 위젯 — "여럿이 쓰는 느낌" 위해 일부러 넣음
- `app/(app)/feed/page.tsx`: 완성 ("소식"으로 이름 바뀜). 글 작성/수정/삭제, 댓글, 이모지 반응, 15초 폴링(WebSocket 아님), 작성자 필터. **맨 위에 주간 리포트 고정 배너 추가됨(2026-07-24)** — `components/weekly-report-banner.tsx` 참고
- `components/coaching-character.tsx`: AI 코칭 캐릭터. 화면 우측 하단, 이모지 placeholder, 클릭하면 대화 패널
- `components/weekly-report-banner.tsx`: 주간 리포트 배너(2026-07-24 추가). `/weekly-reports/latest` 조회해서 팀원별 요약(이니셜 아바타 + 말풍선)을 먼저, 팀 전체 요약은 맨 아래에 🌱 이모지와 함께 톤 다운해서 표시. 리포트 없으면 렌더링 안 함. 스타일은 세밀한 반복 조정 거침(모서리 둥글기, 대비, 위/아래 크기 밸런스 등) — 팀원 3명 이상일 때 레이아웃은 아직 안 봄.
- `lib/api.ts`: `apiFetch` 공용 fetch 래퍼(`credentials: include`, `ApiError` 클래스)
- `lib/date.ts`: `toDateKey`, `getTodayKey`, `getEffectiveTodayKey`(새벽 5시 이전은 전날 취급), `getMonthGrid`, `chunkIntoWeeks`
- `lib/useClickOutside.ts`: 빈 곳 클릭하면 열린 폼/패널 닫히는 공용 훅. Todo/캘린더/준비노트/프로필/코칭캐릭터 화면 전부에 적용해둠
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
11. **SQLAlchemy `relationship("클래스명")` 문자열 참조는, 그 클래스를 실제로 import하는 코드가 앱 어디에도 없으면 첫 쿼리 실행 시점에 `InvalidRequestError`로 터짐 (2026-07-24, 주간 리포트 라우터/스크립트 만들 때 두 번 겪음).** 모델 정의 시점엔 에러가 없다가, `db.query(...)`를 처음 호출하는 순간 SQLAlchemy가 전체 매퍼를 configure하면서 실패함 — 에러 메시지가 엉뚱한 곳(예: `get_current_user`)에서 나서 헷갈리기 쉬움. **해결:** 새 라우터/스크립트를 만들 때, 그 모델이 relationship으로 참조하는 다른 모델 클래스들(`PortfolioLink`, `WeeklyReportMemberSummary` 등)을 실제로 import해줄 것. **교훈:** FastAPI 서버는 `main.py`가 모든 라우터를 import하면서 관련 모델이 다 같이 로드되니 문제가 안 생기지만, 독립 실행 스크립트(`scripts/*.py`)는 필요한 모델만 import하기 쉬워서 특히 주의.
12. **uvicorn `--reload`가 파일 변경은 감지(`WatchFiles detected changes... Reloading...`)하는데 실제로 워커 프로세스를 재시작 안 하고 멈춰있는 경우가 있음 (2026-07-24, Windows).** 로그에 `Reloading...`은 찍히는데 그 이후 `Started server process [PID]`가 다시 안 나옴 — 함정 6번과는 다른 증상(포트 중복 아님, reload 자체가 멈춤). **해결:** 그냥 프로세스 완전히 죽이고(`Stop-Process -Name python -Force`) 새로 켜는 게 제일 빠름. **교훈:** `--reload` 로그에 "감지함"이 찍혔다고 실제 반영됐다고 믿지 말고, 그 뒤에 `Started server process`가 다시 찍히는지까지 확인할 것.
13. **PowerShell에서 괄호 든 경로(`app/(app)/feed/page.tsx`)를 `git add`할 때 bash 스타일 백슬래시 이스케이프(`\(app\)`)를 쓰면 `CommandNotFoundException`이 남 (2026-07-24).** PowerShell은 괄호를 통째로 다른 문법으로 파싱해서 백슬래시 이스케이프가 안 통함. **해결:** 경로 전체를 큰따옴표로 감쌀 것 — `"frontend/app/(app)/feed/page.tsx"`.

## 협업 방식 (지켜온 규칙)
- 사용자는 데이터사이언스 전공, AI/백엔드 학습 중. **혼자 설계하고 코드를 던지지 말고, 제안 → 사용자 검토/결정 → 그 다음에 코드 작성** 순서로 진행해왔음.
- 예외: **순수 보일러플레이트(설정, 재시작, 이미 합의된 CRUD 반복 패턴)는 바로 작성**해도 됨. **설계 결정(스키마 컬럼, 화면 구성, 기능 범위)은 먼저 제안하고 이유를 설명한 뒤, 사용자가 확정하면 코드로 옮기는** 식으로 계속 진행했음.
- **터미널/git/gh 명령어는 내가 직접 실행하지 말고, 사용자에게 그대로 알려줘서 본인이 입력하게 할 것** (2026-07-23 추가). `gh auth status`처럼 읽기 전용인 것도 포함. 결과는 사용자가 붙여넣어 주는 식으로 확인.
  - **예외 (2026-07-24 변경):** 사용자가 권한 설정을 조정해서 **개발 서버(uvicorn/next dev) 실행·재시작은 이제 내가 직접 함.** 서버 켜고 끄는 것, 포트 확인(`netstat`), 헬스체크(`curl`) 등은 직접 실행. **단, `git add`/`git commit`/`git push` 등 git 작업은 여전히 사용자가 직접 실행** — 명령어만 알려줄 것.
- **구현은 하나씩 끊어서, 매 단계마다 뭐가 됐는지 명확히 요약하고 커밋 타이밍을 알려줄 것** (2026-07-23 추가). 파일 3~4개를 한번에 쭉 써버리고 나중에 한꺼번에 요약하지 말고, 한 기능 단위(예: 라우터 파일 하나, 컴포넌트 하나)마다 멈춰서 확인받을 것.
- 화면/스타일 피드백은 세밀한 반복 조정으로 들어옴(색상 hex/oklch 값, 픽셀 단위 여백 등) — 정확한 값으로 빠르게 반영하는 걸 선호함.
- 멀티테넌시("스터디방" — 여러 그룹이 한 서버 공유) 아이디어는 논의했지만 **지금은 안 하기로 결정**(서버 하나=그룹 하나, 재배포로 대응). 나중에 여유 있으면 검토.
- **git 브랜치 전략 (2026-07-23 결정, 2026-07-24 처음 적용).** 지금까지(피드/대시보드/AI 코칭 캐릭터까지) 전부 `main`에 바로 커밋해왔음. 사용자가 뒤늦게 "브랜치 파서 merge 했어야 했다"고 판단 — 과거 커밋은 그대로 두고, **다음 기능부터는 `feature/<이름>` 브랜치 만들어서 작업하고 완료되면 main에 merge하는 방식으로 전환**. `feature/weekly-report`가 이 방식으로 진행한 첫 브랜치. `git push -u origin feature/weekly-report`로 원격에도 등록함(2026-07-24) — **아직 main에 merge/PR은 안 함**, 다음 세션에서 이어서 처리할 것.

## 다음에 할 일 (우선순위 순, 사용자와 합의된 순서 — 2026-07-24 기준 갱신)
1. **✅ 주간 리포트 (2026-07-24 완성).** 생성 스크립트/조회 라우터/프론트 배너/자동 실행 스케줄까지 다 됨(위 "AI 에이전트" 섹션 참고). **남은 건 `feature/weekly-report` → `main` merge(PR)뿐** — 브랜치는 이미 origin에 push해둠, 아직 merge 전.
2. **AI 코칭 캐릭터 2단계** (function calling — 대화로 실제 Todo 추가 등 액션 실행) — 1단계(대화만)는 완성됨. 2단계는 나중에, `C:\Users\rlatn\Desktop\pusan-clone`(카카오테크캠퍼스 과제 레포)의 tool 정의 방식 참고.
3. **✅ 프로필 삭제 로직 버그 수정 완료 (2026-07-24).** `auth.py`의 `delete_profile`에 빠져있던 `prep_items`(+checklist/resources), `portfolio_profiles`(+links), `portfolio_items`(+links), `feed_posts`(+그 글의 댓글/반응), 이 유저가 남의 글에 단 댓글/반응, `weekly_goals`, `coaching_messages`, `weekly_report_member_summaries`까지 전부 정리하도록 추가. **임시 테스트 유저(`__delete_test__`)를 만들어 18개 테이블에 실제로 데이터를 심고 삭제 API를 호출해서 고아 행이 0건인 것까지 검증함.**
   - **DB cascade나 SQLAlchemy relationship cascade는 의도적으로 안 씀.** ORM cascade로 리팩터링하려다가, `feed.py`의 `_load_posts`가 `post.comments = [...]`/`post.reactions = [...]`처럼 관계 속성을 수동으로 덮어쓰는 편법을 쓰고 있어서, `FeedPost`에 `cascade="all, delete-orphan"` 관계를 선언하면 **일반 GET 요청만으로도 댓글/반응이 삭제될 위험**이 있다는 걸 발견함(2026-07-24). 그래서 기존처럼 코드로 직접 지우는 방식을 유지하기로 결정.
   - **남은 위험**: 이 구조상 새로운 `user_id`/`author_id` 참조 테이블이 생기면 또 까먹고 안 지울 수 있음. `delete_profile` 맨 위에 주석으로 남겨뒀으니, **새 테이블 만들 때마다 이 함수도 같이 업데이트할 것.**
4. 남은 폴리시/인프라 작업들: 캘린더-Todo 연동(`show_as_todo` 실제 사용, 지금은 설계만 있고 미구현), 에러 표시 일관성 개선(네트워크/인증 실패 시 화면에 에러 안 뜨는 곳들 — Todo/캘린더 화면 등 대부분의 화면에 아직 없음, `error.tsx`/`loading.tsx` 라우트 파일도 전무), Alembic 마이그레이션 전환, Docker Compose/배포, `users.current_streak`/`longest_streak` 캐시 컬럼 정리(대시보드가 이미 실시간 계산 방식으로 바뀌어서 이 컬럼들이 지금 안 쓰임 — 없애거나 반대로 이 계산 결과로 채워 넣거나 결정 필요).

## 아이디어 (아직 착수 안 함, 2026-07-24 기록)
- **"혼내는" 톤 추가.** 앱의 원래 취지가 동기부여/책임감(accountability)인데, 지금 코칭 캐릭터와 주간 리포트가 항상 다정하기만 함 — 완료율 낮거나 활동 없을 때는 더 세게(장난스럽게) 나가는 톤도 있으면 좋겠다는 아이디어.
  - **트리거 조건**: 활동 0건일 때뿐 아니라 완료율이 낮을 때도 포함(예: 할일 절반 미만 완료).
  - **적용 범위 (사용자가 원하는 것, 우선순위 아직 안 정함)**:
    1. 기존 코칭 캐릭터(`components/coaching-character.tsx`, `routers/coaching.py`)에 조건부로 혼내는 톤 섞기 — 규모 작음, 기존 화면/로직에 분기만 추가하면 됨.
    2. **완전히 새로운 탭**: 지금의 다정한 코칭 캐릭터와는 톤이 아예 다른 "잔소리/장난 캐릭터" 전용 화면 — 재미로 넣는 성격이 강함. 새 라우트/네비게이션/캐릭터 디자인까지 필요해서 규모가 큼.
  - 다음에 실제로 작업 시작할 때, 어느 쪽부터 할지(추천은 1번 — 작고 빠름) 사용자와 다시 확인하고 진행할 것.
- **코칭 캐릭터가 상황 변화에 안 맞춰 유연하게 반응 못 함 (2026-07-24 발견).** "딱딱하다"는 게 말투/톤이 아니라 **경직성(유연하지 못함)**을 뜻함 — 예를 들어 아침에 Todo가 0개라 "오늘 할일이 없네요" 메시지가 생성된 뒤, 사용자가 Todo를 추가해도 그날은 계속 그 옛날 메시지가 그대로 남아있음. 원인은 `coaching.py`의 `get_coaching_messages`가 "그날 그 화면용 메시지가 이미 있으면 그냥 재사용"하는 구조라서, 상태가 바뀌어도 다시 생성 안 함. **2단계(function calling)와는 별개 문제 — 이건 1단계(대화 생성 로직) 자체를 다듬는 작업.**
  - **2026-07-24 결정**: 이건 착수하지 않고 기록만 해둠. **다음 세션 학습 목표를 "캐릭터가 상황 변화에 맞춰 똑똑하게/유연하게 반응하게 만드는 법"으로 잡기로 함** — 구체적 해결 방식(상태 바뀌면 재생성, context를 매번 다시 평가, 등)은 아직 논의 안 함.

## 진행 방식 요청
새 세션에서도 위 "협업 방식"을 유지해줘. 주간 리포트(`feature/weekly-report` → `main` merge 완료)와 프로필 삭제 버그 수정까지 끝난 상태(2026-07-24 기준). **다음 우선순위는 "AI 코칭 캐릭터 2단계"** — 시작 전에 사용자와 범위/방식 다시 확인하고 진행할 것. "제안 → 검토 → 확정 → 코드" 순서, 하나씩 끊어서 진행하는 방식은 계속 유지.