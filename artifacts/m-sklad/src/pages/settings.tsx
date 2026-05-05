import { useState, useEffect } from "react";
import { useUser } from "@clerk/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { User, Building2, Shield, MessageCircle, CheckCircle, XCircle, Save, Link } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  admin: "Завхоз",
  manager: "Админ",
  accountant: "Управляющая",
  warehouse: "Бухгалтер",
};

const CURRENCIES = [
  { value: "KGS", label: "Сом (KGS)" },
  { value: "RUB", label: "Рубль (RUB)" },
  { value: "USD", label: "Доллар (USD)" },
  { value: "EUR", label: "Евро (EUR)" },
  { value: "KZT", label: "Тенге (KZT)" },
];

const TIMEZONES = [
  { value: "Asia/Bishkek", label: "Бишкек (UTC+6)" },
  { value: "Asia/Almaty", label: "Алматы (UTC+6)" },
  { value: "Asia/Tashkent", label: "Ташкент (UTC+5)" },
  { value: "Asia/Dushanbe", label: "Душанбе (UTC+5)" },
  { value: "Europe/Moscow", label: "Москва (UTC+3)" },
  { value: "Asia/Yekaterinburg", label: "Екатеринбург (UTC+5)" },
];

type AppSettings = { id: number; orgName: string; currency: string; timezone: string };
type SystemUser = { id: number; clerkUserId: string; email: string; role: string; firstName: string | null; lastName: string | null; telegramChatId: string | null; createdAt: string };

function ProfileSection() {
  const { user } = useUser();
  const { toast } = useToast();
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFirstName(user?.firstName ?? "");
    setLastName(user?.lastName ?? "");
  }, [user?.firstName, user?.lastName]);

  async function handleSaveName() {
    if (!user) return;
    setSaving(true);
    try {
      await user.update({ firstName, lastName });
      toast({ title: "Имя обновлено" });
    } catch {
      toast({ title: "Ошибка сохранения", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword() {
    if (!user) return;
    try {
      await user.createEmailAddressVerification?.({ strategy: "email_link", redirectUrl: window.location.href });
      toast({ title: "Ссылка отправлена на вашу почту" });
    } catch {
      toast({ title: "Используйте страницу сброса пароля", description: "Перейдите на страницу входа и нажмите 'Забыли пароль'" });
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Личная информация</CardTitle>
          <CardDescription>Ваше имя отображается в системе и отчётах.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Имя</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Имя" />
            </div>
            <div className="space-y-2">
              <Label>Фамилия</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Фамилия" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={user?.primaryEmailAddress?.emailAddress ?? ""} disabled className="bg-muted" />
          </div>
          <Button onClick={handleSaveName} disabled={saving} className="w-full sm:w-auto">
            <Save className="mr-2 h-4 w-4" /> Сохранить имя
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Смена пароля</CardTitle>
          <CardDescription>Для смены пароля воспользуйтесь страницей входа.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={handleChangePassword}>
            Отправить ссылку для смены пароля
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function OrgSection() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: settings, isLoading } = useQuery<AppSettings>({
    queryKey: ["/api/settings"],
    queryFn: () => customFetch("/api/settings").then((r) => r as AppSettings),
  });

  const [orgName, setOrgName] = useState("");
  const [currency, setCurrency] = useState("KGS");
  const [timezone, setTimezone] = useState("Asia/Bishkek");

  useEffect(() => {
    if (settings) {
      setOrgName(settings.orgName);
      setCurrency(settings.currency);
      setTimezone(settings.timezone);
    }
  }, [settings]);

  const save = useMutation({
    mutationFn: () =>
      customFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgName, currency, timezone }),
      }),
    onSuccess: () => {
      toast({ title: "Настройки организации сохранены" });
      qc.invalidateQueries({ queryKey: ["/api/settings"] });
    },
    onError: () => toast({ title: "Ошибка сохранения", variant: "destructive" }),
  });

  if (isLoading) return <div className="py-8 text-center text-muted-foreground">Загрузка...</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Параметры организации</CardTitle>
        <CardDescription>Настройки отображаются во всём интерфейсе системы.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Название системы / организации</Label>
          <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="M-Sklad" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Валюта</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Часовой пояс</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          <Save className="mr-2 h-4 w-4" /> Сохранить
        </Button>
      </CardContent>
    </Card>
  );
}

function AccessSection() {
  const { canDo } = useCurrentUser();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: users, isLoading } = useQuery<SystemUser[]>({
    queryKey: ["/api/admin/users"],
    queryFn: () => customFetch("/api/admin/users").then((r) => r as SystemUser[]),
    enabled: canDo("admin"),
  });

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: number; role: string }) =>
      customFetch(`/api/admin/users/${id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => {
      toast({ title: "Роль изменена" });
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: () => toast({ title: "Ошибка", variant: "destructive" }),
  });

  if (!canDo("admin")) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Раздел доступен только Завхозу.
        </CardContent>
      </Card>
    );
  }

  if (isLoading) return <div className="py-8 text-center text-muted-foreground">Загрузка...</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Зарегистрированные сотрудники</CardTitle>
        <CardDescription>Управляйте ролями пользователей системы.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {!users?.length ? (
            <p className="text-muted-foreground text-sm py-4 text-center">Нет зарегистрированных пользователей.</p>
          ) : (
            users.map((u) => {
              const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
              return (
                <div key={u.id} className="flex items-center justify-between gap-4 p-3 rounded-lg border bg-muted/20">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{name}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  </div>
                  <Select
                    value={u.role}
                    onValueChange={(role) => changeRole.mutate({ id: u.id, role })}
                  >
                    <SelectTrigger className="w-36 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TelegramSection() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: status } = useQuery<{ botConnected: boolean; adminChatConfigured: boolean }>({
    queryKey: ["/api/admin/telegram/status"],
    queryFn: () => customFetch("/api/admin/telegram/status").then((r) => r as { botConnected: boolean; adminChatConfigured: boolean }),
  });

  const { data: me } = useQuery<{ telegramChatId?: string | null }>({
    queryKey: ["/api/auth/me"],
    queryFn: () => customFetch("/api/auth/me").then((r) => r as { telegramChatId?: string | null }),
  });

  const [chatId, setChatId] = useState("");

  useEffect(() => {
    if (me?.telegramChatId) setChatId(me.telegramChatId);
  }, [me?.telegramChatId]);

  const linkTelegram = useMutation({
    mutationFn: () =>
      customFetch("/api/admin/users/me/telegram", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramChatId: chatId || null }),
      }),
    onSuccess: () => {
      toast({ title: chatId ? "Telegram привязан" : "Telegram отвязан" });
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: () => toast({ title: "Ошибка", variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Статус подключения бота</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            {status?.botConnected ? (
              <CheckCircle className="h-5 w-5 text-emerald-600" />
            ) : (
              <XCircle className="h-5 w-5 text-destructive" />
            )}
            <span className="text-sm">
              {status?.botConnected ? "Telegram-бот подключён" : "Telegram-бот не настроен (TELEGRAM_BOT_TOKEN не задан)"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {status?.adminChatConfigured ? (
              <CheckCircle className="h-5 w-5 text-emerald-600" />
            ) : (
              <XCircle className="h-5 w-5 text-destructive" />
            )}
            <span className="text-sm">
              {status?.adminChatConfigured ? "Чат для уведомлений настроен" : "Чат администратора не настроен (TELEGRAM_ADMIN_CHAT_ID не задан)"}
            </span>
          </div>
          {!status?.botConnected && (
            <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium">Как подключить бота:</p>
              <p>1. Создайте бота через @BotFather в Telegram</p>
              <p>2. Скопируйте токен и добавьте переменную <code className="bg-background px-1 rounded">TELEGRAM_BOT_TOKEN</code></p>
              <p>3. Добавьте <code className="bg-background px-1 rounded">TELEGRAM_ADMIN_CHAT_ID</code> — ваш Chat ID для получения уведомлений</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Привязка вашего аккаунта к Telegram</CardTitle>
          <CardDescription>
            Привяжите ваш Telegram к аккаунту, чтобы бот показывал меню с учётом вашей роли.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium">Как узнать ваш Chat ID:</p>
            <p>Отправьте команду <code className="bg-background px-1 rounded">/myid</code> боту в Telegram.</p>
            <p>Бот ответит вашим Chat ID — вставьте его ниже.</p>
          </div>
          <div className="space-y-2">
            <Label>Telegram Chat ID</Label>
            <div className="flex gap-2">
              <Input
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder="Например: 123456789"
                className="max-w-xs"
              />
              <Button onClick={() => linkTelegram.mutate()} disabled={linkTelegram.isPending}>
                <Link className="mr-2 h-4 w-4" /> Привязать
              </Button>
            </div>
          </div>
          {me?.telegramChatId && (
            <div className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle className="h-4 w-4" />
              Привязан Chat ID: <code className="bg-muted px-1 rounded">{me.telegramChatId}</code>
              <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={() => { setChatId(""); linkTelegram.mutate(); }}>
                Отвязать
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Уведомления</CardTitle>
          <CardDescription>Бот отправляет автоматические уведомления на настроенный Chat ID администратора.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2"><Badge variant="outline" className="text-amber-700 bg-amber-50 border-amber-200">⚠️ Низкий остаток</Badge> При падении ниже минимального порога</div>
            <div className="flex items-center gap-2"><Badge variant="outline" className="text-red-700 bg-red-50 border-red-200">🔴 Просрочена аренда</Badge> Проверяется каждый час</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Settings() {
  const { canDo } = useCurrentUser();

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Настройки</h1>
        <p className="text-muted-foreground text-sm">Управление профилем, организацией и доступом.</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="profile" className="gap-2 text-xs sm:text-sm">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">Профиль</span>
          </TabsTrigger>
          <TabsTrigger value="org" className="gap-2 text-xs sm:text-sm">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Организация</span>
          </TabsTrigger>
          <TabsTrigger value="access" className="gap-2 text-xs sm:text-sm" disabled={!canDo("admin")}>
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Доступ</span>
          </TabsTrigger>
          <TabsTrigger value="telegram" className="gap-2 text-xs sm:text-sm">
            <MessageCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Telegram</span>
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="profile"><ProfileSection /></TabsContent>
          <TabsContent value="org"><OrgSection /></TabsContent>
          <TabsContent value="access"><AccessSection /></TabsContent>
          <TabsContent value="telegram"><TelegramSection /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
