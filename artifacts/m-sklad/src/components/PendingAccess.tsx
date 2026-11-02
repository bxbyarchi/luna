import { useEffect } from "react";
import { useLocation } from "wouter";
import { useClerk } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { Hourglass, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/useCurrentUser";

const RECHECK_INTERVAL_MS = 30_000;

export default function PendingAccess() {
  const [, setLocation] = useLocation();
  const { signOut } = useClerk();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();

  const recheck = () => queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });

  // Re-ask /auth/me now and then, so the app opens by itself once a role is granted.
  useEffect(() => {
    const timer = setInterval(() => queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }), RECHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [queryClient]);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md rounded-2xl border bg-background p-8 text-center shadow-sm" data-testid="pending-access">
        <div className="flex justify-center mb-5">
          <div className="rounded-full bg-amber-100 p-4">
            <Hourglass className="h-8 w-8 text-amber-700" />
          </div>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Ждите, администратор выдаст роль</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Вы вошли{user?.email ? <> как <span className="font-medium text-foreground">{user.email}</span></> : null}, но доступ к разделам ещё не выдан.
          Как только администратор назначит вам роль, система откроется сама.
        </p>
        <div className="mt-6 rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
          Если ждёте долго — напишите администратору (Завхозу) и назовите этот email.
        </div>
        <div className="mt-6 flex flex-col sm:flex-row justify-center gap-2">
          <Button variant="outline" onClick={recheck}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Проверить снова
          </Button>
          <Button variant="ghost" onClick={() => signOut(() => setLocation("/"))}>
            <LogOut className="mr-2 h-4 w-4" />
            Выйти
          </Button>
        </div>
      </div>
    </div>
  );
}
