"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");

  const loginMutation = useMutation({
    mutationFn: () => apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
    onSuccess: () => {
      router.push("/profile");
    },
  });

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>studygroup</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              loginMutation.mutate();
            }}
          >
            <Input
              type="password"
              placeholder="공유 비밀번호"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            {loginMutation.isError && (
              <p className="text-sm text-red-500">비밀번호가 틀렸습니다</p>
            )}
            <Button type="submit" disabled={loginMutation.isPending}>
              {loginMutation.isPending ? "확인 중..." : "입장하기"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}