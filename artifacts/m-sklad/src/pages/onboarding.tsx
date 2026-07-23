import { useState } from "react";
import { useLocation } from "wouter";
import { useSession } from "@clerk/react";
import { Button } from "@/components/ui/button";

const ROLES = [
  {
    value: "admin",
    label: "Завхоз",
    sublabel: "Суперадмин — полный доступ ко всем модулям",
    emoji: "🔑",
  },
  {
    value: "manager",
    label: "Админ",
    sublabel: "Управление товарами, поступлениями и списаниями",
    emoji: "⚙️",
  },
  {
    value: "accountant",
    label: "Управляющая",
    sublabel: "Аналитика, просмотр остатков и отчёты",
    emoji: "📊",
  },
  {
    value: "warehouse",
    label: "Бухгалтер",
    sublabel: "Только чтение данных и выгрузка отчётов",
    emoji: "📋",
  },
];

export default function Onboarding() {
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const { session } = useSession();

  async function handleSubmit() {
    if (!selected || !session) return;
    setLoading(true);
    setError(null);
    try {
      const token = await session.getToken();
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      // Ensure the user record exists in the DB (auth/me creates it on first call)
      await fetch("/api/auth/me", { headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) } });

      // Now set the selected role
      const res = await fetch("/api/auth/set-role", {
        method: "POST",
        headers,
        body: JSON.stringify({ role: selected }),
      });
      if (!res.ok) throw new Error("Ошибка сохранения");
      setLocation("/dashboard");
    } catch {
      setError("Не удалось сохранить роль. Попробуйте ещё раз.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-4">
          <div className="flex justify-center items-center gap-2">
            <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Luna-Sklad" className="h-10 w-10" />
            <span className="text-xl font-semibold tracking-tight text-foreground">Luna-Sklad</span>
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">Добро пожаловать!</h1>
            <p className="text-muted-foreground">
              Выберите вашу роль в системе. Это определит, какие функции вам будут доступны.
            </p>
          </div>
        </div>

        <div className="grid gap-3">
          {ROLES.map((role) => {
            const isSelected = selected === role.value;
            return (
              <button
                key={role.value}
                type="button"
                onClick={() => setSelected(role.value)}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                  isSelected
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border bg-background hover:border-primary/40 hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{role.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">{role.label}</p>
                    <p className="text-sm text-muted-foreground">{role.sublabel}</p>
                  </div>
                  <div
                    className={`h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"
                    }`}
                  >
                    {isSelected && (
                      <svg viewBox="0 0 12 12" className="h-3 w-3 text-white fill-white">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}

        <Button
          className="w-full"
          size="lg"
          disabled={!selected || loading}
          onClick={handleSubmit}
        >
          {loading ? "Сохранение..." : "Начать работу →"}
        </Button>
      </div>
    </div>
  );
}
