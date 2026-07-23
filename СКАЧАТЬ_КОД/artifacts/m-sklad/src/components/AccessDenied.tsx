import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ShieldOff, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AccessDeniedProps {
  redirectDelay?: number;
}

export default function AccessDenied({ redirectDelay = 5 }: AccessDeniedProps) {
  const [, setLocation] = useLocation();
  const [countdown, setCountdown] = useState(redirectDelay);

  useEffect(() => {
    if (countdown <= 0) {
      setLocation("/dashboard");
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, setLocation]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="rounded-full bg-destructive/10 p-5 mb-6">
        <ShieldOff className="h-10 w-10 text-destructive" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight mb-2">Доступ запрещён</h1>
      <p className="text-muted-foreground mb-1 max-w-sm">
        У вас нет прав для просмотра этой страницы.
      </p>
      <p className="text-muted-foreground text-sm mb-6 max-w-sm">
        Если вы считаете, что это ошибка, обратитесь к вашему администратору (Завхозу).
      </p>
      <p className="text-sm text-muted-foreground mb-4">
        Перенаправление на главную через {countdown} сек...
      </p>
      <Button variant="outline" onClick={() => setLocation("/dashboard")}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        На главную
      </Button>
    </div>
  );
}
