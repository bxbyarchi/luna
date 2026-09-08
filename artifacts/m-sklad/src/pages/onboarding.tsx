import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading } = useQuery<{ role?: string }>({
    queryKey: ["/api/auth/me"],
    queryFn: () => customFetch("/api/auth/me") as Promise<{ role?: string }>,
  });

  useEffect(() => {
    if (!isLoading && user?.role) setLocation("/dashboard");
  }, [isLoading, user?.role, setLocation]);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md rounded-2xl border bg-background p-8 text-center shadow-sm">
        <div className="flex justify-center mb-5">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Северное сияние" className="h-12 w-12 rounded-xl" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Северное сияние</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Доступ к системе настраивает Завхоз. Вам будет назначена роль и склад, после чего вы сможете начать работу.
        </p>
        <div className="mt-6 rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
          Если доступ ещё не настроен, обратитесь к Завхозу.
        </div>
      </div>
    </div>
  );
}
