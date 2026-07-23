"use client";

import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useClickOutside } from "@/lib/useClickOutside";

const ITEM_TYPE_LABELS: Record<string, string> = {
  cert: "자격증",
  company: "목표기업",
  other: "기타",
};

const PORTFOLIO_TYPE_LABELS: Record<string, string> = {
  certification: "자격증",
  project: "프로젝트",
  experience: "경험/활동",
  award: "수상",
  other: "기타",
};

const ITEM_TYPE_STYLES: Record<string, string> = {
  cert: "border-t-primary bg-primary/5",
  company: "border-t-emerald-500 bg-emerald-500/5",
  other: "border-t-muted-foreground/40 bg-muted/40",
};

const ITEM_TYPE_BADGE: Record<string, string> = {
  cert: "bg-primary/10 text-primary",
  company: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  other: "bg-muted text-muted-foreground",
};

type ItemType = keyof typeof ITEM_TYPE_LABELS;
type PortfolioItemType = keyof typeof PORTFOLIO_TYPE_LABELS;

const PREP_TO_PORTFOLIO_TYPE: Record<ItemType, PortfolioItemType> = {
  cert: "certification",
  company: "other",
  other: "other",
};

type ChecklistItem = {
  id: number;
  content: string;
  completed: boolean;
};

type Resource = {
  id: number;
  title: string;
  url: string | null;
};

type PrepItem = {
  id: number;
  title: string;
  item_type: ItemType;
  notes: string | null;
  completed: boolean;
  position: number;
  checklist_items: ChecklistItem[];
  resources: Resource[];
};

function PrepItemTile({
  item,
  selected,
  onSelect,
  draggable = false,
}: {
  item: PrepItem;
  selected: boolean;
  onSelect: () => void;
  draggable?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !draggable,
  });
  const doneCount = item.checklist_items.filter((c) => c.completed).length;
  const totalCount = item.checklist_items.length;
  const progress = totalCount > 0 ? doneCount / totalCount : 0;

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onSelect}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={
        "flex aspect-square flex-col justify-between rounded-xl border border-t-4 p-4 text-left transition-shadow " +
        ITEM_TYPE_STYLES[item.item_type] +
        (selected ? " ring-2 ring-primary" : " hover:shadow-md") +
        (isDragging ? " opacity-50" : "") +
        (draggable ? " cursor-grab active:cursor-grabbing" : "")
      }
    >
      <span
        className={
          "self-start rounded-full px-2 py-0.5 text-[11px] font-medium " + ITEM_TYPE_BADGE[item.item_type]
        }
      >
        {ITEM_TYPE_LABELS[item.item_type]}
      </span>

      <span className="line-clamp-3 text-base font-bold">{item.title}</span>

      <div className="flex flex-col gap-1">
        {totalCount > 0 && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        )}
        <span className="text-xs text-muted-foreground">
          {totalCount > 0 ? `${doneCount}/${totalCount} 완료` : "체크리스트 없음"}
        </span>
      </div>
    </button>
  );
}

function PrepItemDetail({ item, inPortfolio }: { item: PrepItem; inPortfolio: boolean }) {
  const queryClient = useQueryClient();
  const [newChecklistContent, setNewChecklistContent] = useState("");
  const [newResourceTitle, setNewResourceTitle] = useState("");
  const [newResourceUrl, setNewResourceUrl] = useState("");
  const [notesDraft, setNotesDraft] = useState(item.notes ?? "");
  const [editingNotes, setEditingNotes] = useState(false);
  const [sendingToPortfolio, setSendingToPortfolio] = useState(false);
  const [portfolioType, setPortfolioType] = useState<PortfolioItemType>(
    PREP_TO_PORTFOLIO_TYPE[item.item_type]
  );
  const [portfolioDate, setPortfolioDate] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["prep-items"] });

  const sendToPortfolioMutation = useMutation({
    mutationFn: () =>
      apiFetch("/portfolio-items", {
        method: "POST",
        body: JSON.stringify({
          title: item.title,
          item_type: portfolioType,
          description: item.notes,
          achieved_date: portfolioDate || null,
          source_prep_item_id: item.id,
        }),
      }),
    onSuccess: () => {
      setSendingToPortfolio(false);
      queryClient.invalidateQueries({ queryKey: ["portfolio-items"] });
    },
  });

  const toggleCompletedMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/prep-items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ completed: !item.completed }),
      }),
    onSuccess: invalidate,
  });

  const deleteItemMutation = useMutation({
    mutationFn: () => apiFetch(`/prep-items/${item.id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const saveNotesMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/prep-items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ notes: notesDraft }),
      }),
    onSuccess: () => {
      setEditingNotes(false);
      invalidate();
    },
  });

  const addChecklistMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/prep-items/${item.id}/checklist-items`, {
        method: "POST",
        body: JSON.stringify({ content: newChecklistContent }),
      }),
    onSuccess: () => {
      setNewChecklistContent("");
      invalidate();
    },
  });

  const toggleChecklistMutation = useMutation({
    mutationFn: (checklistItem: ChecklistItem) =>
      apiFetch(`/checklist-items/${checklistItem.id}`, {
        method: "PATCH",
        body: JSON.stringify({ completed: !checklistItem.completed }),
      }),
    onSuccess: invalidate,
  });

  const deleteChecklistMutation = useMutation({
    mutationFn: (checklistItemId: number) =>
      apiFetch(`/checklist-items/${checklistItemId}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const addResourceMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/prep-items/${item.id}/resources`, {
        method: "POST",
        body: JSON.stringify({ title: newResourceTitle, url: newResourceUrl || null }),
      }),
    onSuccess: () => {
      setNewResourceTitle("");
      setNewResourceUrl("");
      invalidate();
    },
  });

  const deleteResourceMutation = useMutation({
    mutationFn: (resourceId: number) => apiFetch(`/resources/${resourceId}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-center gap-2 border-b pb-3">
        <span className="flex-1 text-lg font-bold">{item.title}</span>
        <Button size="sm" variant="ghost" onClick={() => toggleCompletedMutation.mutate()}>
          {item.completed ? "진행 중으로" : "완료 처리"}
        </Button>
        <button
          type="button"
          onClick={() => deleteItemMutation.mutate()}
          className="text-xs text-muted-foreground hover:text-destructive"
        >
          삭제
        </button>
      </div>

      {item.completed && (
        <div className="mb-4 rounded-md border border-dashed p-3">
          {inPortfolio ? (
            <p className="text-sm text-muted-foreground">
              포트폴리오에 있음 —{" "}
              <Link href="/portfolio" className="text-primary hover:underline">
                포트폴리오에서 보기
              </Link>
            </p>
          ) : sendingToPortfolio ? (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                sendToPortfolioMutation.mutate();
              }}
            >
              <select
                className="h-8 rounded-md border bg-background px-2 text-sm"
                value={portfolioType}
                onChange={(e) => setPortfolioType(e.target.value as PortfolioItemType)}
              >
                {Object.entries(PORTFOLIO_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <Input
                type="date"
                value={portfolioDate}
                onChange={(e) => setPortfolioDate(e.target.value)}
                className="h-8 w-36 text-sm"
              />
              <Button type="submit" size="sm" disabled={sendToPortfolioMutation.isPending}>
                보내기
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setSendingToPortfolio(false)}>
                취소
              </Button>
            </form>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setSendingToPortfolio(true)}>
              포트폴리오로 보내기
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-4">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-xs font-medium text-muted-foreground">메모</h3>
            {!editingNotes && (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setNotesDraft(item.notes ?? "");
                  setEditingNotes(true);
                }}
              >
                수정
              </button>
            )}
          </div>
          {editingNotes ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                className="min-h-20 w-full rounded-md border bg-background p-2 text-sm"
                autoFocus
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => saveNotesMutation.mutate()}>
                  저장
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingNotes(false)}>
                  취소
                </Button>
              </div>
            </div>
          ) : (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {item.notes || "메모 없음"}
            </p>
          )}
        </div>

        <div>
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">체크리스트</h3>
          {item.checklist_items.length > 0 && (
            <ul className="mb-2">
              {item.checklist_items.map((checklistItem) => (
                <li
                  key={checklistItem.id}
                  className="flex items-center gap-2 border-b py-1.5 last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => toggleChecklistMutation.mutate(checklistItem)}
                    className={
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border text-[10px] leading-none " +
                      (checklistItem.completed
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground bg-transparent text-transparent")
                    }
                  >
                    ✓
                  </button>
                  <span
                    className={
                      "min-w-0 flex-1 break-words text-sm " +
                      (checklistItem.completed ? "text-muted-foreground line-through" : "")
                    }
                  >
                    {checklistItem.content}
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteChecklistMutation.mutate(checklistItem.id)}
                    className="shrink-0 text-xs text-muted-foreground hover:text-destructive"
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newChecklistContent.trim()) addChecklistMutation.mutate();
            }}
          >
            <Input
              value={newChecklistContent}
              onChange={(e) => setNewChecklistContent(e.target.value)}
              placeholder="체크리스트 추가"
              className="h-8 text-sm"
            />
            <Button type="submit" size="sm" disabled={addChecklistMutation.isPending}>
              추가
            </Button>
          </form>
        </div>

        <div>
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">수집 자료</h3>
          {item.resources.length > 0 && (
            <ul className="mb-2">
              {item.resources.map((resource) => (
                <li
                  key={resource.id}
                  className="flex items-center gap-2 border-b py-1.5 last:border-b-0"
                >
                  {resource.url ? (
                    <a
                      href={resource.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 flex-1 truncate text-sm text-primary hover:underline"
                    >
                      {resource.title}
                    </a>
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-sm">{resource.title}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => deleteResourceMutation.mutate(resource.id)}
                    className="shrink-0 text-xs text-muted-foreground hover:text-destructive"
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newResourceTitle.trim()) addResourceMutation.mutate();
            }}
          >
            <Input
              value={newResourceTitle}
              onChange={(e) => setNewResourceTitle(e.target.value)}
              placeholder="자료 제목"
              className="h-8 text-sm"
            />
            <Input
              value={newResourceUrl}
              onChange={(e) => setNewResourceUrl(e.target.value)}
              placeholder="링크 (선택)"
              className="h-8 text-sm"
            />
            <Button type="submit" size="sm" disabled={addResourceMutation.isPending}>
              추가
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function PrepNotesPage() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newTitleError, setNewTitleError] = useState("");
  const [newType, setNewType] = useState<ItemType>("other");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const createRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  useClickOutside(createRef, () => {
    setCreating(false);
    setNewTitle("");
    setNewTitleError("");
  });
  useClickOutside(detailRef, () => setSelectedId(null));

  const prepItemsQuery = useQuery({
    queryKey: ["prep-items"],
    queryFn: () => apiFetch<PrepItem[]>("/prep-items"),
  });

  const portfolioItemsQuery = useQuery({
    queryKey: ["portfolio-items"],
    queryFn: () => apiFetch<{ source_prep_item_id: number | null }[]>("/portfolio-items"),
  });

  const portfolioPrepItemIds = new Set(
    (portfolioItemsQuery.data ?? [])
      .map((item) => item.source_prep_item_id)
      .filter((id): id is number => id !== null)
  );

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch("/prep-items", {
        method: "POST",
        body: JSON.stringify({ title: newTitle, item_type: newType }),
      }),
    onSuccess: () => {
      setNewTitle("");
      setCreating(false);
      queryClient.invalidateQueries({ queryKey: ["prep-items"] });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: number[]) =>
      apiFetch("/prep-items/reorder", {
        method: "PATCH",
        body: JSON.stringify({ ordered_ids: orderedIds }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["prep-items"] }),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const current = prepItemsQuery.data ?? [];
    const inProgressItems = current.filter((item) => !item.completed);
    const completedItems = current.filter((item) => item.completed);

    const oldIndex = inProgressItems.findIndex((item) => item.id === active.id);
    const newIndex = inProgressItems.findIndex((item) => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(inProgressItems, oldIndex, newIndex);
    queryClient.setQueryData<PrepItem[]>(["prep-items"], [...reordered, ...completedItems]);
    reorderMutation.mutate(reordered.map((item) => item.id));
  };

  if (prepItemsQuery.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">불러오는 중...</p>
      </div>
    );
  }

  const items = prepItemsQuery.data ?? [];
  const inProgress = items.filter((item) => !item.completed);
  const completed = items.filter((item) => item.completed);
  const selectedItem = items.find((item) => item.id === selectedId) ?? null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 pt-16">
      <h1 className="text-xl font-bold">준비 보드</h1>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={inProgress.map((item) => item.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {inProgress.map((item) => (
              <PrepItemTile
                key={item.id}
                item={item}
                draggable
                selected={item.id === selectedId}
                onSelect={() => setSelectedId(item.id === selectedId ? null : item.id)}
              />
            ))}

            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-muted-foreground hover:border-primary hover:text-primary"
            >
              <span className="text-2xl">+</span>
              <span className="text-xs">새 준비 항목</span>
            </button>
          </div>
        </SortableContext>
      </DndContext>

      {creating && (
        <div ref={createRef} className="flex flex-col gap-1 rounded-lg border p-4">
        <form
          className="flex flex-col gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (newTitle.trim()) {
              setNewTitleError("");
              createMutation.mutate();
            } else {
              setNewTitleError("제목을 입력하세요");
            }
          }}
        >
          <div className="flex gap-2">
            <Input
              value={newTitle}
              onChange={(e) => {
                setNewTitle(e.target.value);
                if (newTitleError) setNewTitleError("");
              }}
              placeholder="예: 정보처리기사 취득"
              autoFocus
            />
            <select
              className="h-8 rounded-md border bg-background px-2 text-sm"
              value={newType}
              onChange={(e) => setNewType(e.target.value as ItemType)}
            >
              {Object.entries(ITEM_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <Button type="submit" disabled={createMutation.isPending}>
              추가
            </Button>
            <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
              취소
            </Button>
          </div>
          {newTitleError && <p className="pl-1.5 text-[13px] text-destructive">{newTitleError}</p>}
        </form>
        </div>
      )}

      {selectedItem && (
        <div ref={detailRef}>
          <PrepItemDetail
            item={selectedItem}
            inPortfolio={portfolioPrepItemIds.has(selectedItem.id)}
          />
        </div>
      )}

      {completed.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">완료됨</h2>
          <div className="grid grid-cols-2 gap-4 opacity-70 sm:grid-cols-3">
            {completed.map((item) => (
              <PrepItemTile
                key={item.id}
                item={item}
                selected={item.id === selectedId}
                onSelect={() => setSelectedId(item.id === selectedId ? null : item.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
