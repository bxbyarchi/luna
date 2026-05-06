import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
import { useClerk } from "@clerk/react";
import {
  LayoutDashboard,
  Package,
  Tags,
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardCheck,
  Users,
  History,
  Settings,
  LogOut,
  KeyRound,
  FileBarChart,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@/lib/roles";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { data: user } = useGetMe();
  const { signOut } = useClerk();

  const navigation = [
    { name: "Аналитика", href: "/dashboard", icon: LayoutDashboard, testId: "dashboard" },
    { name: "Склад", href: "/items", icon: Package, testId: "items" },
    { name: "Категории", href: "/categories", icon: Tags, roles: ["admin", "manager"], testId: "categories" },
    { name: "Поступления", href: "/receipts", icon: ArrowDownToLine, testId: "receipts" },
    { name: "Списания", href: "/write-offs", icon: ArrowUpFromLine, roles: ["admin", "manager", "accountant"], testId: "write-offs" },
    { name: "Инвентаризация", href: "/inventory-audits", icon: ClipboardCheck, testId: "inventory-audits" },
    { name: "Аренда", href: "/rentals", icon: KeyRound, testId: "rentals" },
    { name: "Сотрудники", href: "/staff", icon: Users, roles: ["admin", "manager"], testId: "staff" },
    { name: "Отчёты", href: "/reports", icon: FileBarChart, roles: ["admin"], testId: "reports" },
    { name: "Журнал аудита", href: "/audit-log", icon: History, roles: ["admin"], testId: "audit-log" },
    { name: "Настройки", href: "/settings", icon: Settings, roles: ["admin"], testId: "settings" },
  ];

  function closeSidebar() {
    setSidebarOpen(false);
  }

  const sidebarContent = (
    <>
      <div className="p-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="M-Sklad" className="h-8 w-8" />
          <span className="text-base font-semibold tracking-tight">M-Sklad</span>
        </div>
        <button
          className="md:hidden text-sidebar-foreground/70 hover:text-sidebar-foreground p-1"
          onClick={closeSidebar}
          aria-label="Закрыть меню"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto pb-4">
        {navigation.map((item) => {
          if (item.roles && user?.role && !item.roles.includes(user.role)) return null;
          const isActive = location === item.href;
          return (
            <Link key={item.testId} href={item.href}>
              <div
                className={`flex items-center px-3 py-2.5 text-sm font-medium rounded-md cursor-pointer transition-colors ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                }`}
                data-testid={`nav-${item.testId}`}
                onClick={closeSidebar}
              >
                <item.icon className="mr-3 h-5 w-5 flex-shrink-0" />
                {item.name}
              </div>
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm min-w-0">
            <p className="font-medium truncate">{user?.firstName} {user?.lastName}</p>
            <p className="text-sidebar-foreground/60 text-xs">{user?.role ? (ROLE_LABELS[user.role] ?? user.role) : ""}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-sidebar-foreground hover:bg-sidebar-accent shrink-0"
            onClick={() => signOut(() => setLocation("/"))}
            data-testid="btn-signout"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-[100dvh] bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — desktop: always visible | mobile: slide-in drawer */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 w-64 flex flex-col
          bg-sidebar border-r border-sidebar-border text-sidebar-foreground
          transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          md:relative md:translate-x-0 md:flex
        `}
      >
        {sidebarContent}
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex items-center gap-3 px-4 h-14 bg-background border-b border-border md:hidden">
          <button
            className="p-2 -ml-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            onClick={() => setSidebarOpen(true)}
            aria-label="Открыть меню"
            data-testid="btn-open-sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="M-Sklad" className="h-6 w-6" />
            <span className="font-semibold text-sm">M-Sklad</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
