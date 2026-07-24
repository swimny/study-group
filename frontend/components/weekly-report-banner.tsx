"use client";

import { useQuery } from "@tanstack/react-query";

import { ApiError, apiFetch } from "@/lib/api";

type WeeklyReportMemberSummary = {
  user_id: number;
  user_name: string;
  summary: string;
};

type WeeklyReport = {
  week_start_date: string;
  team_summary: string;
  member_summaries: WeeklyReportMemberSummary[];
};

function formatWeekRange(weekStartDate: string): string {
  const [y, m, d] = weekStartDate.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  const end = new Date(y, m - 1, d + 6);
  const fmt = (date: Date) => `${date.getMonth() + 1}/${date.getDate()}`;
  return `${fmt(start)} ~ ${fmt(end)}`;
}

export function WeeklyReportBanner() {
  const reportQuery = useQuery({
    queryKey: ["weekly-report-latest"],
    queryFn: async () => {
      try {
        return await apiFetch<WeeklyReport>("/weekly-reports/latest");
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
  });

  const report = reportQuery.data;
  if (!report) return null;

  return (
    <div className="rounded-lg bg-primary/10 p-4 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-semibold text-primary">이번 주 리포트</h2>
        <span className="text-xs text-muted-foreground">{formatWeekRange(report.week_start_date)}</span>
      </div>

      <div className="flex flex-col gap-2.5">
        {report.member_summaries.map((summary) => (
          <div key={summary.user_id} className="flex items-start gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
              {summary.user_name.slice(0, 1)}
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="text-xs font-medium text-muted-foreground">{summary.user_name}</p>
              <p className="whitespace-pre-wrap break-words rounded-lg bg-background/70 px-3 py-1.5 text-sm leading-relaxed">
                {summary.summary}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-2xl bg-background/60 px-3 py-2.5">
        <span className="shrink-0">🌱</span>
        <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground/80">
          {report.team_summary}
        </p>
      </div>
    </div>
  );
}