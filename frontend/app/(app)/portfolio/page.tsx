"use client";

import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

const ITEM_TYPE_ORDER = ["certification", "project", "experience", "award", "other"] as const;

const ITEM_TYPE_LABELS: Record<string, string> = {
  certification: "자격증",
  project: "프로젝트",
  experience: "경험/활동",
  award: "수상",
  other: "기타",
};

const ENROLLMENT_STATUS_LABELS: Record<string, string> = {
  enrolled: "재학",
  on_leave: "휴학",
  graduated: "졸업",
  expected_graduation: "졸업예정",
};

type ItemType = keyof typeof ITEM_TYPE_LABELS;
type EnrollmentStatus = keyof typeof ENROLLMENT_STATUS_LABELS;

type ProfileLink = {
  id: number;
  title: string;
  url: string | null;
};

type PortfolioProfile = {
  school: string | null;
  major: string | null;
  gpa: string | null;
  enrollment_status: EnrollmentStatus | null;
  intro: string | null;
  links: ProfileLink[];
};

type PortfolioLink = {
  id: number;
  title: string;
  url: string | null;
};

type PortfolioItem = {
  id: number;
  title: string;
  item_type: ItemType;
  description: string | null;
  achieved_date: string | null;
  source_prep_item_id: number | null;
  position: number;
  links: PortfolioLink[];
};

type Me = {
  id: number;
  name: string;
};

function ProfileHeader({ me, profile }: { me: Me | undefined; profile: PortfolioProfile }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [school, setSchool] = useState(profile.school ?? "");
  const [major, setMajor] = useState(profile.major ?? "");
  const [gpa, setGpa] = useState(profile.gpa ?? "");
  const [enrollmentStatus, setEnrollmentStatus] = useState<EnrollmentStatus | "">(
    profile.enrollment_status ?? ""
  );
  const [intro, setIntro] = useState(profile.intro ?? "");
  const [newLinkTitle, setNewLinkTitle] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["portfolio-profile"] });

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch("/portfolio-profile", {
        method: "PATCH",
        body: JSON.stringify({
          school,
          major,
          gpa,
          enrollment_status: enrollmentStatus || null,
          intro,
        }),
      }),
    onSuccess: () => {
      setEditing(false);
      invalidate();
    },
  });

  const addLinkMutation = useMutation({
    mutationFn: () =>
      apiFetch("/portfolio-profile/links", {
        method: "POST",
        body: JSON.stringify({ title: newLinkTitle, url: newLinkUrl || null }),
      }),
    onSuccess: () => {
      setNewLinkTitle("");
      setNewLinkUrl("");
      invalidate();
    },
  });

  const deleteLinkMutation = useMutation({
    mutationFn: (linkId: number) => apiFetch(`/profile-links/${linkId}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">{me?.name ?? "..."}</h1>
          <p className="text-sm text-muted-foreground">포트폴리오</p>
        </div>
        {!editing && (
          <button
            type="button"
            className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setEditing(true)}
          >
            수정
          </button>
        )}
      </div>

      {editing ? (
        <form
          className="mt-4 flex flex-col gap-2 border-t pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
        >
          <Input value={school} onChange={(e) => setSchool(e.target.value)} placeholder="학교" />
          <Input value={major} onChange={(e) => setMajor(e.target.value)} placeholder="전공" />
          <Input
            value={gpa}
            onChange={(e) => setGpa(e.target.value)}
            placeholder="학점 (예: 4.2/4.5)"
          />
          <select
            className="h-8 rounded-md border bg-background px-2 text-sm"
            value={enrollmentStatus}
            onChange={(e) => setEnrollmentStatus(e.target.value as EnrollmentStatus)}
          >
            <option value="">재학상태 선택</option>
            {Object.entries(ENROLLMENT_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <textarea
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            placeholder="한 줄 자기소개"
            className="min-h-16 w-full rounded-md border bg-background p-2 text-sm"
          />

          <div>
            <h3 className="mb-1 text-xs font-medium text-muted-foreground">링크</h3>
            {profile.links.length > 0 && (
              <ul className="mb-2">
                {profile.links.map((link) => (
                  <li
                    key={link.id}
                    className="flex items-center gap-2 border-b py-1.5 last:border-b-0"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">{link.title}</span>
                    <button
                      type="button"
                      onClick={() => deleteLinkMutation.mutate(link.id)}
                      className="shrink-0 text-xs text-muted-foreground hover:text-destructive"
                    >
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-col gap-2">
              <Input
                value={newLinkTitle}
                onChange={(e) => setNewLinkTitle(e.target.value)}
                placeholder="예: GitHub"
                className="h-8 text-sm"
              />
              <Input
                value={newLinkUrl}
                onChange={(e) => setNewLinkUrl(e.target.value)}
                placeholder="URL"
                className="h-8 text-sm"
              />
              <Button
                type="button"
                size="sm"
                disabled={addLinkMutation.isPending}
                onClick={() => {
                  if (newLinkTitle.trim()) addLinkMutation.mutate();
                }}
              >
                링크 추가
              </Button>
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={saveMutation.isPending}>
              저장
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              취소
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-3 flex flex-col gap-1 border-t pt-3">
          {profile.school && <p className="text-sm">{profile.school}</p>}
          {profile.major && <p className="text-sm text-muted-foreground">{profile.major}</p>}
          {(profile.gpa || profile.enrollment_status) && (
            <p className="text-sm text-muted-foreground">
              {[
                profile.gpa ? `학점 ${profile.gpa}` : null,
                profile.enrollment_status ? ENROLLMENT_STATUS_LABELS[profile.enrollment_status] : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          {!profile.school && !profile.major && !profile.gpa && !profile.intro && (
            <p className="text-sm text-muted-foreground">
              기본 정보를 입력해두면 이력서처럼 보여줄 수 있어요.
            </p>
          )}

          {profile.intro && <p className="mt-2 whitespace-pre-wrap text-sm">{profile.intro}</p>}

          {profile.links.length > 0 && (
            <div className="mt-3 flex flex-col gap-1">
              {profile.links.map((link) =>
                link.url ? (
                  <a
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    {link.title}
                  </a>
                ) : (
                  <span key={link.id} className="text-xs text-muted-foreground">
                    {link.title}
                  </span>
                )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PortfolioItemRow({
  item,
  expanded,
  onToggle,
}: {
  item: PortfolioItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const queryClient = useQueryClient();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const [newLinkTitle, setNewLinkTitle] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState(item.description ?? "");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["portfolio-items"] });

  const deleteItemMutation = useMutation({
    mutationFn: () => apiFetch(`/portfolio-items/${item.id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const saveDescriptionMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/portfolio-items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ description: descriptionDraft }),
      }),
    onSuccess: () => {
      setEditingDescription(false);
      invalidate();
    },
  });

  const addLinkMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/portfolio-items/${item.id}/links`, {
        method: "POST",
        body: JSON.stringify({ title: newLinkTitle, url: newLinkUrl || null }),
      }),
    onSuccess: () => {
      setNewLinkTitle("");
      setNewLinkUrl("");
      invalidate();
    },
  });

  const deleteLinkMutation = useMutation({
    mutationFn: (linkId: number) => apiFetch(`/links/${linkId}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={
        "-mx-2 rounded-md border-b border-dashed border-border/70 px-2 py-3 transition-colors last:border-b-0 hover:bg-muted/40" +
        (isDragging ? " opacity-50" : "") +
        (expanded ? " bg-muted/30" : "")
      }
    >
      <button
        type="button"
        onClick={onToggle}
        {...attributes}
        {...listeners}
        className="flex w-full cursor-grab items-baseline justify-between gap-3 text-left active:cursor-grabbing"
      >
        <span className="text-[0.95rem] font-semibold text-foreground">{item.title}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground/80">
          {item.achieved_date ?? ""}
        </span>
      </button>

      {!expanded && item.description && (
        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{item.description}</p>
      )}
      {!expanded && item.links.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-primary">
          {item.links.map((link) =>
            link.url ? (
              <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {link.title}
              </a>
            ) : (
              <span key={link.id} className="text-muted-foreground">
                {link.title}
              </span>
            )
          )}
        </div>
      )}

      {expanded && (
        <div className="mt-3 flex flex-col gap-2.5 border-l-2 border-[color-mix(in_oklch,var(--primary),var(--foreground)_30%)] py-1 pl-3">
          <div className="rounded-md border border-border/70 p-2.5">
            <div className="mb-1.5 flex items-center gap-2">
              <h4 className="text-xs font-medium text-muted-foreground">설명</h4>
              {!editingDescription && (
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => {
                    setDescriptionDraft(item.description ?? "");
                    setEditingDescription(true);
                  }}
                >
                  수정
                </button>
              )}
            </div>
            {editingDescription ? (
              <div className="flex flex-col gap-2">
                <textarea
                  value={descriptionDraft}
                  onChange={(e) => setDescriptionDraft(e.target.value)}
                  className="min-h-16 w-full rounded-md border bg-background p-2 text-sm"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => saveDescriptionMutation.mutate()}>
                    저장
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingDescription(false)}>
                    취소
                  </Button>
                </div>
              </div>
            ) : (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {item.description || "설명 없음"}
              </p>
            )}
          </div>

          <div className="rounded-md border border-border/70 p-2.5">
            <h4 className="mb-1.5 text-xs font-medium text-muted-foreground">링크/자료</h4>
            {item.links.length > 0 && (
              <ul className="mb-2">
                {item.links.map((link) => (
                  <li key={link.id} className="flex items-center gap-2 border-b py-1 last:border-b-0">
                    {link.url ? (
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-0 flex-1 truncate text-sm text-primary hover:underline"
                      >
                        {link.title}
                      </a>
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-sm">{link.title}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => deleteLinkMutation.mutate(link.id)}
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
                if (newLinkTitle.trim()) addLinkMutation.mutate();
              }}
            >
              <Input
                value={newLinkTitle}
                onChange={(e) => setNewLinkTitle(e.target.value)}
                placeholder="링크 제목"
                className="h-8 text-sm"
              />
              <Input
                value={newLinkUrl}
                onChange={(e) => setNewLinkUrl(e.target.value)}
                placeholder="URL (선택)"
                className="h-8 text-sm"
              />
              <Button type="submit" size="sm" disabled={addLinkMutation.isPending}>
                추가
              </Button>
            </form>
          </div>

          <button
            type="button"
            onClick={() => deleteItemMutation.mutate()}
            className="self-start pb-1 text-xs text-muted-foreground hover:text-destructive"
          >
            항목 삭제
          </button>
        </div>
      )}
    </div>
  );
}

function PortfolioSection({
  type,
  items,
  expandedId,
  onToggleExpand,
  onReorder,
}: {
  type: ItemType;
  items: PortfolioItem[];
  expandedId: number | null;
  onToggleExpand: (id: number) => void;
  onReorder: (reorderedSectionItems: PortfolioItem[]) => void;
}) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch("/portfolio-items", {
        method: "POST",
        body: JSON.stringify({
          title: newTitle,
          item_type: type,
          achieved_date: newDate || null,
        }),
      }),
    onSuccess: () => {
      setNewTitle("");
      setNewDate("");
      setAdding(false);
      queryClient.invalidateQueries({ queryKey: ["portfolio-items"] });
    },
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    onReorder(arrayMove(items, oldIndex, newIndex));
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between border-b-2 border-[color-mix(in_oklch,var(--primary),var(--foreground)_25%)]/25 pb-1.5">
        <h2 className="text-xs font-semibold tracking-wide text-[color-mix(in_oklch,var(--primary),var(--foreground)_30%)] uppercase">
          {ITEM_TYPE_LABELS[type]}
        </h2>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-primary"
          onClick={() => setAdding((v) => !v)}
        >
          + 추가
        </button>
      </div>

      {items.length === 0 && !adding && (
        <p className="py-2 text-xs text-muted-foreground">아직 등록된 항목이 없어요.</p>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
          {items.map((item) => (
            <PortfolioItemRow
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              onToggle={() => onToggleExpand(item.id)}
            />
          ))}
        </SortableContext>
      </DndContext>

      {adding && (
        <form
          className="flex gap-2 border-b py-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (newTitle.trim()) createMutation.mutate();
          }}
        >
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={`예: ${ITEM_TYPE_LABELS[type]} 이름`}
            className="h-8 text-sm"
            autoFocus
          />
          <Input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="h-8 w-36 text-sm"
          />
          <Button type="submit" size="sm" disabled={createMutation.isPending}>
            추가
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
            취소
          </Button>
        </form>
      )}
    </div>
  );
}

export default function PortfolioPage() {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<Me>("/me"),
  });

  const portfolioItemsQuery = useQuery({
    queryKey: ["portfolio-items"],
    queryFn: () => apiFetch<PortfolioItem[]>("/portfolio-items"),
  });

  const profileQuery = useQuery({
    queryKey: ["portfolio-profile"],
    queryFn: () => apiFetch<PortfolioProfile>("/portfolio-profile"),
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: number[]) =>
      apiFetch("/portfolio-items/reorder", {
        method: "PATCH",
        body: JSON.stringify({ ordered_ids: orderedIds }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["portfolio-items"] }),
  });

  if (portfolioItemsQuery.isLoading || profileQuery.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">불러오는 중...</p>
      </div>
    );
  }

  const items = portfolioItemsQuery.data ?? [];

  const handleSectionReorder = (type: ItemType, reorderedSectionItems: PortfolioItem[]) => {
    let pointer = 0;
    const newFullOrder = items.map((item) =>
      item.item_type === type ? reorderedSectionItems[pointer++] : item
    );
    queryClient.setQueryData<PortfolioItem[]>(["portfolio-items"], newFullOrder);
    reorderMutation.mutate(newFullOrder.map((item) => item.id));
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 p-6 pt-16 md:grid md:grid-cols-[280px_1fr] md:items-start md:gap-10">
      <div className="md:sticky md:top-16">
        <ProfileHeader me={meQuery.data} profile={profileQuery.data!} />
      </div>

      <div className="flex flex-col gap-9">
        {ITEM_TYPE_ORDER.map((type) => (
          <PortfolioSection
            key={type}
            type={type}
            items={items.filter((item) => item.item_type === type)}
            expandedId={expandedId}
            onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
            onReorder={(reordered) => handleSectionReorder(type, reordered)}
          />
        ))}
      </div>
    </div>
  );
}