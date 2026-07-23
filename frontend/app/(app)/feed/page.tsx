"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useClickOutside } from "@/lib/useClickOutside";

const REACTION_EMOJI = ["👍", "🔥", "💪", "👏", "❤️"];

type Comment = {
  id: number;
  author_id: number;
  author_name: string;
  content: string;
  created_at: string;
};

type Reaction = {
  emoji: string;
  count: number;
  reacted_by_me: boolean;
};

type Post = {
  id: number;
  author_id: number;
  author_name: string;
  content: string;
  created_at: string;
  updated_at: string | null;
  comments: Comment[];
  reactions: Reaction[];
};

type Me = {
  id: number;
  name: string;
};

type FeedUser = {
  id: number;
  name: string;
};

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ReactionBar({ post }: { post: Post }) {
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useClickOutside(pickerRef, () => setPickerOpen(false));

  const toggleMutation = useMutation({
    mutationFn: (emoji: string) =>
      apiFetch(`/feed-posts/${post.id}/reactions`, {
        method: "POST",
        body: JSON.stringify({ emoji }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feed-posts"] }),
  });

  const activeReactions = post.reactions.filter((r) => r.count > 0);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {activeReactions.map((reaction) => (
        <button
          key={reaction.emoji}
          type="button"
          disabled={toggleMutation.isPending}
          onClick={() => toggleMutation.mutate(reaction.emoji)}
          className={
            "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs " +
            (reaction.reacted_by_me
              ? "border-primary bg-primary/10 text-primary"
              : "border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/60")
          }
        >
          <span>{reaction.emoji}</span>
          <span>{reaction.count}</span>
        </button>
      ))}

      <div ref={pickerRef} className="relative">
        <button
          type="button"
          onClick={() => setPickerOpen((open) => !open)}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-muted-foreground/30 text-xs text-muted-foreground hover:border-muted-foreground/60"
          aria-label="반응 추가"
        >
          +
        </button>
        {pickerOpen && (
          <div className="absolute bottom-full left-0 z-10 mb-1 flex gap-1 rounded-full border bg-popover p-1 shadow-md">
            {REACTION_EMOJI.map((emoji) => (
              <button
                key={emoji}
                type="button"
                disabled={toggleMutation.isPending}
                onClick={() => {
                  toggleMutation.mutate(emoji);
                  setPickerOpen(false);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-full text-base hover:bg-accent"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CommentList({ post, me }: { post: Post; me?: Me }) {
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");

  const createCommentMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/feed-posts/${post.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => {
      setContent("");
      queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: number) => apiFetch(`/comments/${commentId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feed-posts"] }),
  });

  return (
    <div className="mt-3 flex flex-col gap-2 border-t pt-3">
      {post.comments.map((comment) => (
        <div
          key={comment.id}
          className="flex items-start justify-between gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm"
        >
          <div>
            <span className="font-medium">{comment.author_name}</span>
            <p className="mt-0.5 whitespace-pre-wrap break-words text-muted-foreground">
              {comment.content}
            </p>
          </div>
          {me?.id === comment.author_id && (
            <button
              type="button"
              className="shrink-0 text-xs text-muted-foreground hover:text-destructive"
              onClick={() => deleteCommentMutation.mutate(comment.id)}
            >
              삭제
            </button>
          )}
        </div>
      ))}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (content.trim()) createCommentMutation.mutate();
        }}
      >
        <Input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="댓글 달기"
          className="h-8 text-sm"
        />
        <Button type="submit" size="sm" disabled={createCommentMutation.isPending}>
          등록
        </Button>
      </form>
    </div>
  );
}

function PostCard({ post, me }: { post: Post; me?: Me }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(post.content);
  const editRef = useRef<HTMLDivElement>(null);

  useClickOutside(editRef, () => {
    if (editing) {
      setContent(post.content);
      setEditing(false);
    }
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/feed-posts/${post.id}`, {
        method: "PATCH",
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => {
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/feed-posts/${post.id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feed-posts"] }),
  });

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-2 flex items-start justify-between">
        <div>
          <span className="font-semibold">{post.author_name}</span>{" "}
          <span className="text-xs text-muted-foreground">
            {formatTimestamp(post.created_at)}
            {post.updated_at && " (수정됨)"}
          </span>
        </div>
        {me?.id === post.author_id && !editing && (
          <div className="flex gap-2 text-xs text-muted-foreground">
            <button type="button" className="hover:text-foreground" onClick={() => setEditing(true)}>
              수정
            </button>
            <button
              type="button"
              className="hover:text-destructive"
              onClick={() => deleteMutation.mutate()}
            >
              삭제
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div ref={editRef}>
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (content.trim()) updateMutation.mutate();
            }}
          >
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-20 w-full rounded-md border bg-transparent p-2 text-sm"
              autoFocus
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={updateMutation.isPending}>
                저장
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setContent(post.content);
                  setEditing(false);
                }}
              >
                취소
              </Button>
            </div>
          </form>
        </div>
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm">{post.content}</p>
      )}

      <div className="mt-3">
        <ReactionBar post={post} />
      </div>

      <CommentList post={post} me={me} />
    </div>
  );
}

export default function FeedPage() {
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [selectedAuthorId, setSelectedAuthorId] = useState<number | null>(null);

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<Me>("/me"),
  });

  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: () => apiFetch<FeedUser[]>("/users"),
  });

  const postsQuery = useQuery({
    queryKey: ["feed-posts"],
    queryFn: () => apiFetch<Post[]>("/feed-posts"),
    refetchInterval: 15000,
  });

  const createPostMutation = useMutation({
    mutationFn: () =>
      apiFetch("/feed-posts", {
        method: "POST",
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => {
      setContent("");
      queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
    },
  });

  if (postsQuery.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">불러오는 중...</p>
      </div>
    );
  }

  const filteredPosts = (postsQuery.data ?? []).filter(
    (post) => selectedAuthorId === null || post.author_id === selectedAuthorId
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6 pt-16">
      <h1 className="text-xl font-bold">소식</h1>

      <div className="flex flex-wrap gap-2 border-b pb-3">
        <button
          type="button"
          onClick={() => setSelectedAuthorId(null)}
          className={
            "rounded-full px-3 py-1 text-sm " +
            (selectedAuthorId === null
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground")
          }
        >
          전체
        </button>
        {usersQuery.data?.map((user) => (
          <button
            key={user.id}
            type="button"
            onClick={() => setSelectedAuthorId(user.id)}
            className={
              "rounded-full px-3 py-1 text-sm " +
              (selectedAuthorId === user.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground")
            }
          >
            {user.name}
          </button>
        ))}
      </div>

      {(selectedAuthorId === null || selectedAuthorId === meQuery.data?.id) && (
        <form
          className="flex flex-col gap-2 rounded-lg border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (content.trim()) createPostMutation.mutate();
          }}
        >
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="오늘의 진행 상황을 공유해보세요"
            className="min-h-20 w-full rounded-md border bg-transparent p-2 text-sm"
          />
          <Button type="submit" disabled={createPostMutation.isPending} className="self-end">
            게시
          </Button>
        </form>
      )}

      {filteredPosts.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">아직 올라온 글이 없어요.</p>
      )}

      {filteredPosts.map((post) => (
        <PostCard key={post.id} post={post} me={meQuery.data} />
      ))}
    </div>
  );
}