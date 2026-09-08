import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
import { useClerk } from "@clerk/react";
import { LayoutDashboard, Package, Tags, ArrowDownToLine, ArrowUpFromLine, ClipboardCheck, Users, History, Settings, LogOut, KeyRound, FileBarChart, Menu, X, MapPin, Snowflake, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@/lib/roles";

const LOCATIONS = ["Кой Таш", "Площадь", "Азия Молл", "Скай Парк", "Ош", "Лермонтова", "Прохладное"] as const;

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { data: user } = useGetMe();
  const { signOut } = useClerk();
  const navigation = [
    { name: "Аналитика", href: "/dashboard", icon: LayoutDashboard, testId: "dashboard" },
    { name: "Склад", href: "/items", icon: Package, testId: "items" },
    { name: "Перемещения", href: "/transfers", icon: Truck, testId: "transfers" },
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
  const closeSidebar = () => setSidebarOpen(false);
  const assignedLocation = (user as any)?.locationName as string | null | undefined;
  const displayLocation = user?.role === "admin"
    ? "Все склады"
    : assignedLocation && LOCATIONS.includes(assignedLocation as typeof LOCATIONS[number])
      ? assignedLocation
      : "Склад не назначен";

  return <div className="flex min-h-[100dvh] bg-background">
    {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={closeSidebar} aria-hidden="true" />}
    <aside className={`fixed inset-y-0 left-0 z-40 w-64 flex flex-col bg-sidebar border-r border-sidebar-border text-sidebar-foreground transform transition-transform duration-200 ease-in-out ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:relative md:translate-x-0 md:flex`}>
      <div className="p-5 flex items-center justify-between"><div className="flex items-center gap-3 min-w-0"><img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Северное сияние" className="h-9 w-9 rounded-xl" /><div className="min-w-0"><div className="text-base font-bold tracking-tight truncate">Северное сияние</div><div className="text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/50">Ярмарка</div></div></div><button className="md:hidden p-1" onClick={closeSidebar} aria-label="Закрыть меню"><X className="h-5 w-5" /></button></div>
      <div className="mx-3 mb-4 rounded-xl border border-sidebar-border bg-sidebar-accent/60 p-3"><div className="flex items-center gap-2 text-xs font-semibold text-sidebar-foreground/70"><MapPin className="h-3.5 w-3.5" />Склад</div><div className="mt-2 text-sm font-semibold">{displayLocation}</div><div className="mt-2 flex items-center gap-1.5 text-[10px] text-sidebar-foreground/45"><Snowflake className="h-3 w-3" />Зимняя ярмарка</div></div>
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto pb-4">{navigation.map((item) => { if (item.roles && user?.role && !item.roles.includes(user.role)) return null; const isActive = location === item.href; return <Link key={item.testId} href={item.href}><div className={`flex items-center px-3 py-2.5 text-sm font-medium rounded-md cursor-pointer transition-colors ${isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"}`} data-testid={`nav-${item.testId}`} onClick={closeSidebar}><item.icon className="mr-3 h-5 w-5 flex-shrink-0" />{item.name}</div></Link>; })}</nav>
      <div className="p-4 border-t border-sidebar-border"><div className="flex items-center justify-between gap-2"><div className="text-sm min-w-0"><p className="font-medium truncate">{user?.firstName} {user?.lastName}</p><p className="text-sidebar-foreground/60 text-xs">{user?.role ? (ROLE_LABELS[user.role] ?? user.role) : ""}</p></div><Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent shrink-0" onClick={() => signOut(() => setLocation("/"))}><LogOut className="h-4 w-4" /></Button></div></div>
    </aside>
    <div className="flex-1 flex flex-col min-w-0"><header className="sticky top-0 z-20 flex items-center gap-3 px-4 h-14 bg-background border-b border-border md:hidden"><button className="p-2 -ml-2" onClick={() => setSidebarOpen(true)} aria-label="Открыть меню"><Menu className="h-5 w-5" /></button><div className="flex items-center gap-2"><img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Северное сияние" className="h-7 w-7 rounded-lg" /><span className="font-bold text-sm">Северное сияние</span></div></header><main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">{children}</main></div>
  </div>;
}
