"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch, ApiError } from "@/lib/api";
import { useClickOutside } from "@/lib/useClickOutside";

type Profile = {
  id: number;
  name: string;
};

function ProfileRow({
  profile,
  onSelect,
  selecting,
}: {
  profile: Profile;
  onSelect: () => void;
  selecting: boolean;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"idle" | "rename" | "delete">("idle");
  const [newName, setNewName] = useState(profile.name);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const rowRef = useRef<HTMLDivElement>(null);

  useClickOutside(rowRef, () => {
    if (mode !== "idle") {
      setMode("idle");
      setNewName(profile.name);
      setPassword("");
      setError("");
    }
  });

  const invalidateProfiles = () =>
    queryClient.invalidateQueries({ queryKey: ["profiles"] });

  const renameMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/auth/profiles/${profile.id}`, {
        method: "PATCH",
        body: JSON.stringify({ new_name: newName, password }),
      }),
    onSuccess: () => {
      setMode("idle");
      setPassword("");
      invalidateProfiles();
    },
    onError: () => setError("비밀번호가 틀렸습니다"),
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/auth/profiles/${profile.id}`, {
        method: "DELETE",
        body: JSON.stringify({ password }),
      }),
    onSuccess: () => {
      setMode("idle");
      setPassword("");
      invalidateProfiles();
    },
    onError: () => setError("비밀번호가 틀렸습니다"),
  });

  if (mode === "rename") {
    return (
      <div ref={rowRef}>
      <form
        className="flex flex-col gap-2 rounded-md border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          if (newName.trim() && password.trim()) renameMutation.mutate();
        }}
      >
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="새 이름"
          autoFocus
        />
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="이 프로필의 비밀번호"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-2">
          <Button
            type="submit"
            size="sm"
            disabled={renameMutation.isPending || !newName.trim() || !password.trim()}
          >
            저장
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setMode("idle")}>
            취소
          </Button>
        </div>
      </form>
      </div>
    );
  }

  if (mode === "delete") {
    return (
      <div ref={rowRef}>
      <form
        className="flex flex-col gap-2 rounded-md border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          if (password.trim()) deleteMutation.mutate();
        }}
      >
        <p className="text-sm">&quot;{profile.name}&quot; 프로필을 삭제할까요? 관련 데이터가 모두 삭제됩니다.</p>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="이 프로필의 비밀번호"
          autoFocus
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-2">
          <Button
            type="submit"
            size="sm"
            variant="destructive"
            disabled={deleteMutation.isPending || !password.trim()}
          >
            삭제
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setMode("idle")}>
            취소
          </Button>
        </div>
      </form>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        className="flex-1 justify-start"
        disabled={selecting}
        onClick={onSelect}
      >
        {profile.name}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setMode("rename")}>
        수정
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setMode("delete")}>
        삭제
      </Button>
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const createRef = useRef<HTMLDivElement>(null);

  useClickOutside(createRef, () => {
    setCreating(false);
    setNewName("");
    setNewPassword("");
  });

  const profilesQuery = useQuery({
    queryKey: ["profiles"],
    queryFn: () => apiFetch<Profile[]>("/auth/profiles"),
    retry: false,
  });

  useEffect(() => {
    if (
      profilesQuery.isError &&
      profilesQuery.error instanceof ApiError &&
      profilesQuery.error.status === 401
    ) {
      router.push("/");
    }
  }, [profilesQuery.isError, profilesQuery.error, router]);

  const selectMutation = useMutation({
    mutationFn: (userId: number) =>
      apiFetch("/auth/select-profile", {
        method: "POST",
        body: JSON.stringify({ user_id: userId }),
      }),
    onSuccess: () => router.push("/dashboard"),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch("/auth/profiles", {
        method: "POST",
        body: JSON.stringify({ name: newName, password: newPassword }),
      }),
    onSuccess: () => router.push("/dashboard"),
  });

  if (profilesQuery.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-zinc-500">불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>누구세요?</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {profilesQuery.data?.map((profile) => (
            <ProfileRow
              key={profile.id}
              profile={profile}
              selecting={selectMutation.isPending}
              onSelect={() => selectMutation.mutate(profile.id)}
            />
          ))}

          {creating ? (
            <div ref={createRef}>
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (newName.trim() && newPassword.trim()) createMutation.mutate();
              }}
            >
              <Input
                placeholder="이름"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
              <Input
                type="password"
                placeholder="이 프로필의 비밀번호 (수정/삭제 시 필요)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <Button
                type="submit"
                disabled={createMutation.isPending || !newName.trim() || !newPassword.trim()}
              >
                {createMutation.isPending ? "생성 중..." : "생성하고 입장"}
              </Button>
            </form>
            </div>
          ) : (
            <Button
              variant="secondary"
              className="hover:bg-accent hover:text-accent-foreground"
              onClick={() => setCreating(true)}
            >
              새 프로필 만들기
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}