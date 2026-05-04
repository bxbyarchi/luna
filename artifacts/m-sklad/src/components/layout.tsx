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
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: user } = useGetMe();
  const { signOut } = useClerk();

  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Items", href: "/items", icon: Package },
    { name: "Categories", href: "/categories", icon: Tags, roles: ["admin", "manager"] },
    { name: "Receipts", href: "/receipts", icon: ArrowDownToLine },
    { name: "Write-offs", href: "/write-offs", icon: ArrowUpFromLine },
    { name: "Audits", href: "/inventory-audits", icon: ClipboardCheck },
    { name: "Staff", href: "/staff", icon: Users },
    { name: "Audit Log", href: "/audit-log", icon: History, roles: ["admin"] },
    { name: "Settings", href: "/settings", icon: Settings },
  ];

  return (
    <div className="flex min-h-[100dvh] bg-background">
      {/* Sidebar */}
      <div className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col text-sidebar-foreground">
        <div className="p-6">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="M-Sklad Logo" className="h-8" />
        </div>
        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            if (item.roles && user?.role && !item.roles.includes(user.role)) return null;
            const isActive = location === item.href;
            return (
              <Link key={item.name} href={item.href}>
                <div
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-md cursor-pointer transition-colors ${
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  }`}
                  data-testid={`nav-${item.name.toLowerCase().replace(" ", "-")}`}
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
              <p className="text-sidebar-foreground/60 capitalize">{user?.role}</p>
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

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
