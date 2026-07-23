"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { chunkIntoWeeks, getMonthGrid, toDateKey, type MonthGridCell } from "@/lib/date";
import { useClickOutside } from "@/lib/useClickOutside";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const LANE_HEIGHT = 18;
const BARS_TOP_OFFSET = 32;
const MIN_ROW_HEIGHT = 80;

type CalendarEvent = {
  id: number;
  owner_id: number;
  title: string;
  start_date: string;
  end_date: string;
  visibility: "private" | "shared";
};

type UserProfile = {
  id: number;
  name: string;
};

type Segment = {
  event: CalendarEvent;
  colStart: number;
  colEnd: number;
  continuesFromPrevRow: boolean;
  continuesToNextRow: boolean;
  lane: number;
};

function buildRowSegments(week: MonthGridCell[], events: CalendarEvent[]): Segment[] {
  const weekKeys = week.map((cell) => toDateKey(cell.date));
  const rowStartKey = weekKeys[0];
  const rowEndKey = weekKeys[6];

  const raw = events
    .filter((event) => event.start_date <= rowEndKey && event.end_date >= rowStartKey)
    .map((event) => {
      const overlapStartKey = event.start_date > rowStartKey ? event.start_date : rowStartKey;
      const overlapEndKey = event.end_date < rowEndKey ? event.end_date : rowEndKey;
      return {
        event,
        colStart: weekKeys.indexOf(overlapStartKey),
        colEnd: weekKeys.indexOf(overlapEndKey),
        continuesFromPrevRow: event.start_date < rowStartKey,
        continuesToNextRow: event.end_date > rowEndKey,
        lane: 0,
      };
    })
    .sort((a, b) => a.colStart - b.colStart);

  const laneEndCols: number[] = [];
  for (const segment of raw) {
    let lane = laneEndCols.findIndex((endCol) => endCol < segment.colStart);
    if (lane === -1) {
      lane = laneEndCols.length;
      laneEndCols.push(segment.colEnd);
    } else {
      laneEndCols[lane] = segment.colEnd;
    }
    segment.lane = lane;
  }

  return raw;
}

export default function CalendarPage() {
  const queryClient = useQueryClient();
  const today = new Date();
  const todayKey = toDateKey(today);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(viewYear);
  const [pickerMonth, setPickerMonth] = useState(viewMonth);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [titleError, setTitleError] = useState("");
  const [endDate, setEndDate] = useState("");
  const [visibility, setVisibility] = useState<"private" | "shared">("private");
  const navRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  useClickOutside(navRef, () => setPickerOpen(false));
  useClickOutside(detailRef, () => setSelectedDateKey(null));

  const eventsQuery = useQuery({
    queryKey: ["calendar-events", viewYear, viewMonth],
    queryFn: () => apiFetch<CalendarEvent[]>(`/calendar-events?year=${viewYear}&month=${viewMonth}`),
  });

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<UserProfile>("/me"),
  });

  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: () => apiFetch<UserProfile[]>("/users"),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch("/calendar-events", {
        method: "POST",
        body: JSON.stringify({
          title,
          start_date: selectedDateKey,
          end_date: endDate || null,
          visibility,
        }),
      }),
    onSuccess: () => {
      setTitle("");
      setEndDate("");
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (eventId: number) =>
      apiFetch(`/calendar-events/${eventId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calendar-events"] }),
  });

  const goToMonth = (year: number, month: number) => {
    let y = year;
    let m = month;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setViewYear(y);
    setViewMonth(m);
    setSelectedDateKey(null);
  };

  const events = eventsQuery.data ?? [];
  const weeks = chunkIntoWeeks(getMonthGrid(viewYear, viewMonth));
  const selectedEvents = selectedDateKey
    ? events.filter((event) => event.start_date <= selectedDateKey && selectedDateKey <= event.end_date)
    : [];

  const myId = meQuery.data?.id;
  const userNameById = new Map((usersQuery.data ?? []).map((user) => [user.id, user.name]));

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6 pt-16">
      <div ref={navRef}>
      <div className="flex items-center justify-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => goToMonth(viewYear, viewMonth - 1)}>
          ◀
        </Button>
        <button
          type="button"
          className="text-lg font-bold hover:text-primary"
          onClick={() => {
            setPickerYear(viewYear);
            setPickerMonth(viewMonth);
            setPickerOpen((v) => !v);
          }}
        >
          {viewYear}년 {viewMonth}월
        </button>
        <Button variant="ghost" size="icon" onClick={() => goToMonth(viewYear, viewMonth + 1)}>
          ▶
        </Button>
      </div>

      {pickerOpen && (
        <div className="flex items-center justify-center gap-2">
          <select
            className="rounded-md border bg-background px-2 py-1 text-sm"
            value={pickerYear}
            onChange={(e) => setPickerYear(Number(e.target.value))}
          >
            {Array.from({ length: 11 }, (_, i) => today.getFullYear() - 5 + i).map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
          <select
            className="rounded-md border bg-background px-2 py-1 text-sm"
            value={pickerMonth}
            onChange={(e) => setPickerMonth(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}월
              </option>
            ))}
          </select>
          <Button
            size="sm"
            onClick={() => {
              goToMonth(pickerYear, pickerMonth);
              setPickerOpen(false);
            }}
          >
            이동
          </Button>
        </div>
      )}
      </div>

      <div className="overflow-hidden rounded-lg border">
        <div className="grid grid-cols-7 border-b bg-muted text-center text-xs text-muted-foreground">
          {WEEKDAY_LABELS.map((label, i) => (
            <div
              key={label}
              className={
                "py-1.5 " +
                (i === 0 ? "text-red-500 dark:text-red-400" : i === 6 ? "text-blue-500 dark:text-blue-400" : "")
              }
            >
              {label}
            </div>
          ))}
        </div>

        {weeks.map((week, weekIndex) => {
          const segments = buildRowSegments(week, events);
          const laneCount = Math.max(0, ...segments.map((s) => s.lane + 1));
          const rowMinHeight = Math.max(MIN_ROW_HEIGHT, BARS_TOP_OFFSET + laneCount * LANE_HEIGHT + 8);

          return (
            <div key={weekIndex} className="relative grid grid-cols-7 border-b last:border-b-0">
              {week.map((cell) => {
                const dateKey = toDateKey(cell.date);
                const isToday = dateKey === todayKey;
                const isSelected = dateKey === selectedDateKey;
                const dow = cell.date.getDay();
                const weekdayColor = isToday
                  ? ""
                  : dow === 0
                    ? "text-red-500 dark:text-red-400"
                    : dow === 6
                      ? "text-blue-500 dark:text-blue-400"
                      : "";

                return (
                  <button
                    key={dateKey}
                    type="button"
                    onClick={() => setSelectedDateKey(dateKey)}
                    style={{ minHeight: rowMinHeight }}
                    className={
                      "flex flex-col items-start border-r p-1.5 text-left text-xs transition-colors last:border-r-0 hover:bg-muted " +
                      (cell.inMonth ? "" : "bg-muted/30 ") +
                      (isSelected ? "bg-accent" : "")
                    }
                  >
                    <span
                      className={
                        "flex h-5 w-5 items-center justify-center rounded-full text-[11px] " +
                        (isToday ? "bg-primary text-primary-foreground" : weekdayColor) +
                        (cell.inMonth ? "" : " opacity-40")
                      }
                    >
                      {cell.date.getDate()}
                    </span>
                  </button>
                );
              })}

              <div
                className="pointer-events-none absolute inset-x-0 grid grid-cols-7"
                style={{ top: BARS_TOP_OFFSET, rowGap: 3 }}
              >
                {segments.map((segment) => (
                  <div
                    key={`${segment.event.id}-${weekIndex}`}
                    style={{
                      gridColumn: `${segment.colStart + 1} / ${segment.colEnd + 2}`,
                      gridRow: segment.lane + 1,
                      height: LANE_HEIGHT - 2,
                    }}
                    className={
                      "truncate px-1.5 text-[10px] leading-4 " +
                      (segment.event.visibility === "shared"
                        ? "bg-accent text-accent-foreground"
                        : "bg-muted text-foreground") +
                      " " +
                      (segment.continuesFromPrevRow ? "" : "ml-0.5 rounded-l-sm") +
                      (segment.continuesToNextRow ? "" : " mr-0.5 rounded-r-sm")
                    }
                  >
                    {segment.continuesFromPrevRow ? "◂ " : ""}
                    {segment.event.title}
                    {segment.continuesToNextRow ? " ▸" : ""}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {selectedDateKey && (
        <div ref={detailRef} className="rounded-lg border p-4">
          <h2 className="mb-2 font-semibold">{selectedDateKey}</h2>

          {selectedEvents.length > 0 && (
            <ul className="mb-3">
              {selectedEvents.map((event) => (
                <li key={event.id} className="flex items-center gap-2 border-b py-1.5 last:border-b-0">
                  <span className="flex-1 text-sm">{event.title}</span>
                  {event.start_date !== event.end_date && (
                    <span className="text-xs text-muted-foreground">
                      {event.start_date} ~ {event.end_date}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {event.visibility === "shared"
                      ? `전체공유 · ${userNameById.get(event.owner_id) ?? "?"}`
                      : "개인"}
                  </span>
                  {event.owner_id === myId && (
                    <button
                      type="button"
                      onClick={() => deleteMutation.mutate(event.id)}
                      className="text-xs text-muted-foreground hover:text-destructive"
                    >
                      삭제
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (title.trim()) {
                setTitleError("");
                createMutation.mutate();
              } else {
                setTitleError("일정 제목을 입력하세요");
              }
            }}
          >
            <Input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (titleError) setTitleError("");
              }}
              placeholder="일정 제목"
              className="h-8 text-sm"
            />
            {titleError && <p className="pl-1.5 text-[13px] text-destructive">{titleError}</p>}
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">종료일</label>
              <input
                type="date"
                value={endDate}
                min={selectedDateKey}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-sm"
                placeholder={selectedDateKey}
              />
              <select
                className="h-8 flex-1 rounded-md border bg-background px-2 text-sm"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as "private" | "shared")}
              >
                <option value="private">개인</option>
                <option value="shared">전체공유</option>
              </select>
              <Button type="submit" size="sm" disabled={createMutation.isPending}>
                추가
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}