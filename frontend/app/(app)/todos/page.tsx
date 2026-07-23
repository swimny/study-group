"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getEffectiveTodayKey, getEffectiveYesterdayKey } from "@/lib/date";
import { apiFetch } from "@/lib/api";
import { useClickOutside } from "@/lib/useClickOutside";

type Category = {
  id: number;
  name: string;
};

type Todo = {
  id: number;
  category_id: number;
  title: string;
  completed: boolean;
  date: string;
};

function TodoRow({ todo }: { todo: Todo }) {
  const queryClient = useQueryClient();

  const toggleMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/todos/${todo.id}`, {
        method: "PATCH",
        body: JSON.stringify({ completed: !todo.completed }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["todos"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/todos/${todo.id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["todos"] }),
  });

  return (
    <li className="flex items-center gap-2 border-b py-2 last:border-b-0">
      <button
        type="button"
        aria-label={todo.completed ? "완료 취소" : "완료로 표시"}
        onClick={() => toggleMutation.mutate()}
        className={
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border text-[10px] leading-none " +
          (todo.completed
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground bg-transparent text-transparent")
        }
      >
        ✓
      </button>
      <span
        className={
          "min-w-0 flex-1 break-words text-sm " +
          (todo.completed ? "text-muted-foreground line-through" : "")
        }
      >
        {todo.title}
      </span>
      <button
        type="button"
        aria-label="삭제"
        onClick={() => deleteMutation.mutate()}
        className="shrink-0 text-xs text-muted-foreground hover:text-destructive"
      >
        삭제
      </button>
    </li>
  );
}

function YesterdayCallout({
  todos,
  categoriesById,
  today,
}: {
  todos: Todo[];
  categoriesById: Map<number, Category>;
  today: string;
}) {
  const queryClient = useQueryClient();
  const incomplete = todos.filter((t) => !t.completed);

  const carryOverMutation = useMutation({
    mutationFn: (todoId: number) =>
      apiFetch(`/todos/${todoId}`, {
        method: "PATCH",
        body: JSON.stringify({ date: today }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["todos"] }),
  });

  if (incomplete.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
      <h2 className="mb-2 text-sm font-semibold text-amber-600 dark:text-amber-400">
        ⚠ 어제 놓친 할 일 {incomplete.length}개
      </h2>
      <ul className="flex flex-col gap-1.5">
        {incomplete.map((todo) => (
          <li key={todo.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 flex-1 break-words">
              <span className="mr-1.5 text-xs text-muted-foreground">
                {categoriesById.get(todo.category_id)?.name}
              </span>
              {todo.title}
            </span>
            <button
              type="button"
              disabled={carryOverMutation.isPending}
              onClick={() => carryOverMutation.mutate(todo.id)}
              className="shrink-0 text-xs text-amber-600 hover:underline dark:text-amber-400"
            >
              오늘로 가져오기
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CategorySection({
  category,
  todos,
  today,
}: {
  category: Category;
  todos: Todo[];
  today: string;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [titleError, setTitleError] = useState("");
  const [headerMode, setHeaderMode] = useState<"view" | "rename" | "delete">("view");
  const [newCategoryName, setNewCategoryName] = useState(category.name);
  const headerRef = useRef<HTMLDivElement>(null);

  useClickOutside(headerRef, () => {
    if (headerMode !== "view") {
      setNewCategoryName(category.name);
      setHeaderMode("view");
    }
  });

  const invalidateCategories = () =>
    queryClient.invalidateQueries({ queryKey: ["categories"] });

  const createTodoMutation = useMutation({
    mutationFn: () =>
      apiFetch("/todos", {
        method: "POST",
        body: JSON.stringify({ category_id: category.id, title, date: today }),
      }),
    onSuccess: () => {
      setTitle("");
      setTitleError("");
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });

  const renameCategoryMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/todo-categories/${category.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: newCategoryName }),
      }),
    onSuccess: () => {
      setHeaderMode("view");
      invalidateCategories();
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: () => apiFetch(`/todo-categories/${category.id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidateCategories();
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });

  return (
    <div className="rounded-lg border p-4">
      <div ref={headerRef}>
      {headerMode === "rename" ? (
        <form
          className="mb-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (newCategoryName.trim()) renameCategoryMutation.mutate();
          }}
        >
          <Input
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            className="h-8 text-sm"
            autoFocus
          />
          <Button type="submit" size="sm" disabled={renameCategoryMutation.isPending}>
            저장
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setNewCategoryName(category.name);
              setHeaderMode("view");
            }}
          >
            취소
          </Button>
        </form>
      ) : headerMode === "delete" ? (
        <div className="mb-2 flex items-center gap-2">
          <p className="flex-1 text-sm">
            &quot;{category.name}&quot; 카테고리와 안의 할 일을 모두 삭제할까요?
          </p>
          <Button
            size="sm"
            variant="destructive"
            disabled={deleteCategoryMutation.isPending}
            onClick={() => deleteCategoryMutation.mutate()}
          >
            삭제
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setHeaderMode("view")}>
            취소
          </Button>
        </div>
      ) : (
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">{category.name}</h2>
          <div className="flex gap-2 text-xs text-muted-foreground">
            <button type="button" className="hover:text-foreground" onClick={() => setHeaderMode("rename")}>
              수정
            </button>
            <button type="button" className="hover:text-destructive" onClick={() => setHeaderMode("delete")}>
              삭제
            </button>
          </div>
        </div>
      )}
      </div>
      {todos.length > 0 && (
        <ul className="mb-2">
          {todos.map((todo) => (
            <TodoRow key={todo.id} todo={todo} />
          ))}
        </ul>
      )}
      <form
        className="flex flex-col gap-[3px]"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) {
            setTitleError("");
            createTodoMutation.mutate();
          } else {
            setTitleError("할 일을 입력하세요");
          }
        }}
      >
        <div className="flex gap-2">
          <Input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (titleError) setTitleError("");
            }}
            placeholder="할 일 추가"
            className="h-8 text-sm"
          />
          <Button type="submit" size="sm" disabled={createTodoMutation.isPending}>
            추가
          </Button>
        </div>
        {titleError && <p className="pl-1.5 text-[13px] text-destructive">{titleError}</p>}
      </form>
    </div>
  );
}

export default function TodosPage() {
  const queryClient = useQueryClient();
  const today = getEffectiveTodayKey();
  const yesterday = getEffectiveYesterdayKey();
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryError, setNewCategoryError] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const addCategoryRef = useRef<HTMLDivElement>(null);

  useClickOutside(addCategoryRef, () => {
    setAddingCategory(false);
    setNewCategoryName("");
    setNewCategoryError("");
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch<Category[]>("/todo-categories"),
  });

  const todosQuery = useQuery({
    queryKey: ["todos", today],
    queryFn: () => apiFetch<Todo[]>(`/todos?date=${today}`),
  });

  const yesterdayTodosQuery = useQuery({
    queryKey: ["todos", yesterday],
    queryFn: () => apiFetch<Todo[]>(`/todos?date=${yesterday}`),
  });

  const createCategoryMutation = useMutation({
    mutationFn: () =>
      apiFetch("/todo-categories", {
        method: "POST",
        body: JSON.stringify({ name: newCategoryName }),
      }),
    onSuccess: () => {
      setNewCategoryName("");
      setAddingCategory(false);
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });

  if (categoriesQuery.isLoading || todosQuery.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">불러오는 중...</p>
      </div>
    );
  }

  const todosByCategory = new Map<number, Todo[]>();
  for (const todo of todosQuery.data ?? []) {
    const list = todosByCategory.get(todo.category_id) ?? [];
    list.push(todo);
    todosByCategory.set(todo.category_id, list);
  }

  const categoriesById = new Map<number, Category>();
  for (const category of categoriesQuery.data ?? []) {
    categoriesById.set(category.id, category);
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-6 pt-16">
      <h1 className="text-xl font-bold">오늘의 할 일</h1>

      <YesterdayCallout
        todos={yesterdayTodosQuery.data ?? []}
        categoriesById={categoriesById}
        today={today}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {categoriesQuery.data?.map((category) => (
          <CategorySection
            key={category.id}
            category={category}
            todos={todosByCategory.get(category.id) ?? []}
            today={today}
          />
        ))}
      </div>

      <div ref={addCategoryRef}>
      {addingCategory ? (
        <form
          className="flex flex-col gap-[3px]"
          onSubmit={(e) => {
            e.preventDefault();
            if (newCategoryName.trim()) {
              setNewCategoryError("");
              createCategoryMutation.mutate();
            } else {
              setNewCategoryError("카테고리 이름을 입력하세요");
            }
          }}
        >
          <div className="flex gap-2">
            <Input
              value={newCategoryName}
              onChange={(e) => {
                setNewCategoryName(e.target.value);
                if (newCategoryError) setNewCategoryError("");
              }}
              placeholder="카테고리 이름"
              autoFocus
            />
            <Button type="submit" disabled={createCategoryMutation.isPending}>
              추가
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAddingCategory(false)}>
              취소
            </Button>
          </div>
          {newCategoryError && <p className="pl-1.5 text-[13px] text-destructive">{newCategoryError}</p>}
        </form>
      ) : (
        <Button
          variant="secondary"
          className="hover:bg-accent hover:text-accent-foreground"
          onClick={() => setAddingCategory(true)}
        >
          + 카테고리 추가
        </Button>
      )}
      </div>
    </div>
  );
}