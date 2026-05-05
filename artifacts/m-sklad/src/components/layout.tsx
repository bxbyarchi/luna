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
} from "lucide-react";
import { Button } from "@/components/ui/button";

const ROLE_LABELS: Record<string, string> = {
  admin: "Завхоз",
  manager: "Админ",
  accountant: "Управляющая",
  warehouse: "Бухгалтер",
};

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: user } = useGetMe();
  const { signOut } = useClerk();

  const navigation = [
    { name: "Аналитика", href: "/dashboard", icon: LayoutDashboard, testId: "dashboard" },
    { name: "Склад", href: "/items", icon: Package, testId: "items" },
    { name: "Категории", href: "/categories", icon: Tags, roles: ["admin", "manager"], testId: "categories" },
    { name: "Поступления", href: "/receipts", icon: ArrowDownToLine, testId: "receipts" },
    { name: "Списания", href: "/write-offs", icon: ArrowUpFromLine, testId: "write-offs" },
    { name: "Инвентаризация", href: "/inventory-audits", icon: ClipboardCheck, testId: "inventory-audits" },
    { name: "Аренда", href: "/rentals", icon: KeyRound, testId: "rentals" },
    { name: "Сотрудники", href: "/staff", icon: Users, testId: "staff" },
    { name: "Отчёты", href: "/reports", icon: FileBarChart, roles: ["admin"], testId: "reports" },
    { name: "Журнал аудита", href: "/audit-log", icon: History, roles: ["admin"], testId: "audit-log" },
    { name: "Настройки", href: "/settings", icon: Settings, roles: ["admin"], testId: "settings" },
  ];

  return (
    <div className="flex min-h-[100dvh] bg-background">
      {/* Боковая панель */}
      <div className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col text-sidebar-foreground">
        <div className="p-6">
          <div className="flex items-center gap-2">
            <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="M-Sklad" className="h-8 w-8" />
            <span className="text-base font-semibold tracking-tight">M-Sklad</span>
          </div>
        </div>
        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            if (item.roles && user?.role && !item.roles.includes(user.role)) return null;
            const isActive = location === item.href;
            return (
              <Link key={item.testId} href={item.href}>
                <div
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-md cursor-pointer transition-colors ${
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  }`}
                  data-testid={`nav-${item.testId}`}
                >
                  <item.icon className="mr-3 h-5 w-5 flex-shrink-0" />
                  {item.name}
                </div>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <p className="font-medium">{user?.firstName} {user?.lastName}</p>
              <p className="text-sidebar-foreground/60">{user?.role ? (ROLE_LABELS[user.role] ?? user.role) : ""}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-sidebar-foreground hover:bg-sidebar-accent"
              onClick={() => signOut(() => setLocation("/"))}
              data-testid="btn-signout"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Основной контент */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
