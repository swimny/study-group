"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { chunkIntoWeeks, getEffectiveTodayKey, getEffectiveWeekStartKey } from "@/lib/date";

type Me = { id: number; name: string };

type TeamProgressEntry = {
  user_id: number;
  name: string;
  completed: number;
  total: number;
};

type Streak = { current_streak: number; longest_streak: number };

type HeatmapDay = { date: string; completed: boolean };

type WeeklyGoal = {
  id: number;
  week_start_date: string;
  title: string;
  completed: boolean;
};

type FeedPost = {
  id: number;
  author_name: string;
  content: string;
  created_at: string;
};

type CalendarEvent = {
  id: number;
  owner_id: number;
  title: string;
  start_date: string;
  end_date: string;
  visibility: "private" | "shared";
};

type RecentPortfolioActivity = {
  id: number;
  user_id: number;
  author_name: string;
  title: string;
  item_type: string;
  achieved_date: string | null;
  created_at: string;
};

const PORTFOLIO_TYPE_LABELS: Record<string, string> = {
  certification: "자격증",
  project: "프로젝트",
  experience: "경험/활동",
  award: "수상",
  other: "기타",
};

function TeamProgressBars({ entries, meId }: { entries: TeamProgressEntry[]; meId?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {entries.map((entry) => {
        const pct = entry.total === 0 ? 0 : Math.round((entry.completed / entry.total) * 100);
        return (
          <div key={entry.user_id}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className={entry.user_id === meId ? "font-semibold text-primary" : "font-medium"}>
                {entry.name}
                {entry.user_id === meId && " (나)"}
              </span>
              <span className="text-xs text-muted-foreground">
                {entry.total === 0 ? "오늘 할 일 없음" : `${entry.completed}/${entry.total}`}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProgressRing({ completed, total }: { completed: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);

  return (
    <div className="relative flex h-28 w-28 items-center justify-center">
      <svg width="112" height="112" viewBox="0 0 100 100" className="-rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" className="stroke-muted" strokeWidth="10" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          className="stroke-primary"
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-xl font-bold">{pct}%</span>
        <span className="text-xs text-muted-foreground">
          {completed}/{total}
        </span>
      </div>
    </div>
  );
}

function StreakHeatmap({ days, streak }: { days: HeatmapDay[]; streak?: Streak }) {
  const weeks = chunkIntoWeeks(days);

  return (
    <div>
      <div className="mb-2 flex items-baseline gap-3">
        <span className="text-xl font-bold">🔥 {streak?.current_streak ?? 0}일</span>
        <span className="text-xs text-muted-foreground">최장 {streak?.longest_streak ?? 0}일</span>
      </div>
      <div className="flex flex-col gap-1">
        {weeks.map((week, i) => (
          <div key={i} className="flex gap-1">
            {week.map((day) => (
              <div
                key={day.date}
                title={day.date}
                className={
                  "h-3 w-3 rounded-sm " + (day.completed ? "bg-primary" : "bg-muted")
                }
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function WeeklyGoalsWidget() {
  const queryClient = useQueryClient();
  const weekStart = getEffectiveWeekStartKey();
  const [title, setTitle] = useState("");

  const goalsQuery = useQuery({
    queryKey: ["weekly-goals", weekStart],
    queryFn: () => apiFetch<WeeklyGoal[]>(`/weekly-goals?week_start_date=${weekStart}`),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch("/weekly-goals", {
        method: "POST",
        body: JSON.stringify({ week_start_date: weekStart, title }),
      }),
    onSuccess: () => {
      setTitle("");
      queryClient.invalidateQueries({ queryKey: ["weekly-goals", weekStart] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, completed }: { id: number; completed: boolean }) =>
      apiFetch(`/weekly-goals/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ completed }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["weekly-goals", weekStart] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/weekly-goals/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["weekly-goals", weekStart] }),
  });

  const goals = goalsQuery.data ?? [];
  const doneCount = goals.filter((g) => g.completed).length;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">이번 주 목표</h3>
        <span className="text-xs text-muted-foreground">
          {goals.length === 0 ? "" : `${doneCount}/${goals.length}`}
        </span>
      </div>
      {goals.length > 0 && (
        <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${goals.length === 0 ? 0 : Math.round((doneCount / goals.length) * 100)}%` }}
          />
        </div>
      )}
      <ul className="mb-2 flex flex-col gap-1.5">
        {goals.map((goal) => (
          <li key={goal.id} className="flex items-center gap-2 text-sm">
            <button
              type="button"
              aria-label={goal.completed ? "완료 취소" : "완료로 표시"}
              onClick={() => toggleMutation.mutate({ id: goal.id, completed: !goal.completed })}
              className={
                "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border text-[10px] leading-none " +
                (goal.completed
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-muted-foreground bg-transparent text-transparent")
              }
            >
              ✓
            </button>
            <span
              className={
                "min-w-0 flex-1 break-words " +
                (goal.completed ? "text-muted-foreground line-through" : "")
              }
            >
              {goal.title}
            </span>
            <button
              type="button"
              className="shrink-0 text-xs text-muted-foreground hover:text-destructive"
              onClick={() => deleteMutation.mutate(goal.id)}
            >
              삭제
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) createMutation.mutate();
        }}
      >
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="이번 주 목표 추가"
          className="h-8 text-sm"
        />
        <Button type="submit" size="sm" disabled={createMutation.isPending}>
          추가
        </Button>
      </form>
    </div>
  );
}

export default function DashboardPage() {
  const today = getEffectiveTodayKey();
  const now = new Date();

  const meQuery = useQuery({ queryKey: ["me"], queryFn: () => apiFetch<Me>("/me") });

  const teamProgressQuery = useQuery({
    queryKey: ["dashboard-team-progress", today],
    queryFn: () => apiFetch<TeamProgressEntry[]>(`/dashboard/team-progress?date=${today}`),
  });

  const streakQuery = useQuery({
    queryKey: ["dashboard-streak", today],
    queryFn: () => apiFetch<Streak>(`/dashboard/streak?today=${today}`),
  });

  const heatmapQuery = useQuery({
    queryKey: ["dashboard-heatmap", today],
    queryFn: () => apiFetch<HeatmapDay[]>(`/dashboard/activity-heatmap?end_date=${today}&days=84`),
  });

  const feedQuery = useQuery({
    queryKey: ["feed-posts"],
    queryFn: () => apiFetch<FeedPost[]>("/feed-posts"),
  });

  const calendarQuery = useQuery({
    queryKey: ["calendar-events", now.getFullYear(), now.getMonth() + 1],
    queryFn: () =>
      apiFetch<CalendarEvent[]>(
        `/calendar-events?year=${now.getFullYear()}&month=${now.getMonth() + 1}`
      ),
  });

  const portfolioActivityQuery = useQuery({
    queryKey: ["dashboard-recent-portfolio-activity"],
    queryFn: () => apiFetch<RecentPortfolioActivity[]>("/dashboard/recent-portfolio-activity?limit=5"),
  });

  if (teamProgressQuery.isLoading || meQuery.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">불러오는 중...</p>
      </div>
    );
  }

  const myProgress = teamProgressQuery.data?.find((e) => e.user_id === meQuery.data?.id);
  const recentPosts = (feedQuery.data ?? []).slice(0, 3);
  const upcomingSharedEvents = (calendarQuery.data ?? [])
    .filter((e) => e.visibility === "shared" && e.end_date >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .slice(0, 3);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6 pt-16">
      <h1 className="text-xl font-bold">대시보드</h1>

      <div className="rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">오늘 팀원 진행률</h2>
        <TeamProgressBars entries={teamProgressQuery.data ?? []} meId={meQuery.data?.id} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground">최근 소식</h2>
            <Link href="/feed" className="text-xs text-primary hover:underline">
              더보기
            </Link>
          </div>
          {recentPosts.length === 0 ? (
            <p className="text-sm text-muted-foreground">아직 올라온 소식이 없어요.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {recentPosts.map((post) => (
                <li key={post.id} className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                  <span className="font-medium">{post.author_name}</span>
                  <p className="mt-0.5 truncate text-muted-foreground">{post.content}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground">다가오는 공유 일정</h2>
            <Link href="/calendar" className="text-xs text-primary hover:underline">
              더보기
            </Link>
          </div>
          {upcomingSharedEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">예정된 공유 일정이 없어요.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {upcomingSharedEvents.map((event) => (
                <li key={event.id} className="flex items-center justify-between text-sm">
                  <span>{event.title}</span>
                  <span className="text-xs text-muted-foreground">{event.start_date}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">최근 팀 성과</h2>
        {(portfolioActivityQuery.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 등록된 성과가 없어요.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {(portfolioActivityQuery.data ?? []).map((item) => (
              <li key={item.id} className="flex items-center justify-between text-sm">
                <span>
                  <span className="font-medium">{item.author_name}</span>
                  <span className="text-muted-foreground"> · {PORTFOLIO_TYPE_LABELS[item.item_type]}</span>{" "}
                  {item.title}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t pt-6">
        <p className="mb-3 text-xs font-medium text-muted-foreground">내 통계</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="flex items-center justify-center rounded-lg border p-4">
            <ProgressRing completed={myProgress?.completed ?? 0} total={myProgress?.total ?? 0} />
          </div>
          <div className="rounded-lg border p-4">
            <StreakHeatmap days={heatmapQuery.data ?? []} streak={streakQuery.data} />
          </div>
          <div className="rounded-lg border p-4">
            <WeeklyGoalsWidget />
          </div>
        </div>
      </div>
    </div>
  );
}