"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  BookOpen,
  Users,
  Settings,
  Bot,
  LogOut,
} from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/projects", icon: FolderKanban, label: "Projects" },
  { href: "/tasks", icon: CheckSquare, label: "Tasks" },
  { href: "/work-log", icon: BookOpen, label: "Work Log" },
  { href: "/pmsecai-usage", icon: Bot, label: "PMSecAI Usage" },
  { href: "/team", icon: Users, label: "Team" },
  { href: "/admin", icon: Settings, label: "Admin" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-60 flex-col border-r bg-card">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <Bot className="h-6 w-6 text-primary" />
        <span className="text-lg font-bold tracking-tight">PMSecAI</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              pathname === href
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>

      {/* User */}
      <div className="flex items-center gap-3 border-t p-4">
        <UserButton afterSignOutUrl="/sign-in" />
        <span className="text-sm text-muted-foreground">Account</span>
      </div>
    </aside>
  );
}
