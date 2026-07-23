"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { getEffectiveTodayKey } from "@/lib/date";
import { useClickOutside } from "@/lib/useClickOutside";

type ScreenContext = "dashboard" | "todos" | "calendar" | "prep_notes";

type CoachingMessage = {
  id: number;
  role: "assistant" | "user";
  content: string;
  created_at: string;
};

function getScreenContext(pathname: string): ScreenContext | null {
  if (pathname.startsWith("/dashboard")) return "dashboard";
  if (pathname.startsWith("/todos")) return "todos";
  if (pathname.startsWith("/calendar")) return "calendar";
  if (pathname.startsWith("/prep-notes")) return "prep_notes";
  return null;
}

export function CoachingCharacter() {
  const pathname = usePathname();
  const screenContext = getScreenContext(pathname);
  const today = getEffectiveTodayKey();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  useClickOutside(panelRef, () => setOpen(false));

  const messagesQuery = useQuery({
    queryKey: ["coaching-messages", screenContext, today],
    queryFn: () =>
      apiFetch<CoachingMessage[]>(
        `/coaching-messages?screen_context=${screenContext}&date=${today}`
      ),
    enabled: screenContext !== null,
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      apiFetch<CoachingMessage>("/coaching-messages", {
        method: "POST",
        body: JSON.stringify({ screen_context: screenContext, date: today, content: draft }),
      }),
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["coaching-messages", screenContext, today] });
    },
  });

  if (!screenContext) return null;

  const messages = messagesQuery.data ?? [];
  const latest = messages[messages.length - 1];

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {open && (
        <div
          ref={panelRef}
          className="flex w-80 flex-col gap-2 rounded-lg border bg-popover p-3 shadow-lg"
        >
          <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
            {messagesQuery.isLoading && (
              <p className="text-sm text-muted-foreground">불러오는 중...</p>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={
                  "max-w-[85%] rounded-md px-3 py-2 text-sm " +
                  (m.role === "assistant"
                    ? "self-start bg-muted"
                    : "self-end bg-primary text-primary-foreground")
                }
              >
                {m.content}
              </div>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim()) sendMutation.mutate();
            }}
          >
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="말 걸어보기..."
              className="h-8 text-sm"
            />
            <Button type="submit" size="sm" disabled={sendMutation.isPending}>
              전송
            </Button>
          </form>
        </div>
      )}

      {!open && latest && (
        <div className="max-w-60 rounded-lg border bg-popover px-2.5 py-1.5 text-xs shadow-md">
          {latest.content}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative -top-2 text-5xl leading-none drop-shadow-md transition-transform hover:scale-105"
        aria-label="코칭 캐릭터"
      >
        🐥
      </button>
    </div>
  );
}