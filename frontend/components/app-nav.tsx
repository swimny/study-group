"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "대시보드" },
  { href: "/calendar", label: "캘린더" },
  { href: "/todos", label: "Todo" },
  { href: "/feed", label: "소식" },
  { href: "/prep-notes", label: "준비 보드" },
  { href: "/portfolio", label: "포트폴리오" },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="flex w-48 shrink-0 flex-col gap-1 border-r bg-sidebar p-4">
      <p className="mb-2 px-2 text-lg font-semibold text-sidebar-foreground">
        studygroup
      </p>
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              "rounded-md px-3 py-2 text-sm font-medium transition-colors " +
              (isActive
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground")
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}