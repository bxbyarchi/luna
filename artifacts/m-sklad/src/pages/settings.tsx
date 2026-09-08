import { useEffect, useState } from "react";
import { useUser } from "@clerk/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { User, Building2, Shield, MessageCircle, CheckCircle, XCircle, Save, Link, Plus, Trash2, Eye, EyeOff, Warehouse } from "lucide-react";
import { ROLE_LABELS } from "@/lib/roles";

const CURRENCIES = [{ value: "KGS", label: "Сом (KGS)" }];
const TIMEZONES = [
  { value: "Asia/Bishkek", label: "Бишкек (UTC+6)" },
  { value: "Asia/Almaty", label: "Алматы (UTC+6)" },
  { value: "Asia/Tashkent", label: "Ташкент (UTC+5)" },
  { value: "Asia/Dushanbe", label: "Душанбе (UTC+5)" },
  { value: "Europe/Moscow", label: "Москва (UTC+3)" },
  { value: "Asia/Yekaterinburg", label: "Екатеринбург (UTC+5)" },
];

type AppSettings = { id: number; orgName: string; currency: string; timezone: string };
type Location = { id: number; name: string; code: string; isActive: boolean };
type SystemUser = {
  id: number;
  clerkUserId: string;
  email: string;
  role: string;
  firstName: string | null;
  lastName: string | null;
  telegramChatId: string | null;
  locationId: number | null;
  createdAt: string;
};

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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Личная информация</CardTitle>
          <CardDescription>Ваше имя отображается в системе и отчётах.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Имя</Label><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Имя" /></div>
            <div className="space-y-2"><Label>Фамилия</Label><Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Фамилия" /></div>
          </div>
          <div className="space-y-2"><Label>Email</Label><Input value={user?.primaryEmailAddress?.emailAddress ?? ""} disabled className="bg-muted" /></div>
          <Button onClick={handleSaveName} disabled={saving}><Save className="mr-2 h-4 w-4" />Сохранить имя</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Смена пароля</CardTitle><CardDescription>Для смены пароля воспользуйтесь страницей входа.</CardDescription></CardHeader>
        <CardContent><Button variant="outline" onClick={() => toast({ title: "Смена пароля", description: "Перейдите на страницу входа и нажмите «Забыли пароль»." })}>Отправить инструкцию</Button></CardContent>
      </Card>
    </div>
  );
}

function OrgSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery<AppSettings>({ queryKey: ["/api/settings"], queryFn: () => customFetch("/api/settings").then((r) => r as AppSettings) });
  const [orgName, setOrgName] = useState("");
  const [currency, setCurrency] = useState("KGS");
  const [timezone, setTimezone] = useState("Asia/Bishkek");

  useEffect(() => {
    if (settings) { setOrgName(settings.orgName); setCurrency(settings.currency); setTimezone(settings.timezone); }
  }, [settings]);

  const save = useMutation({
    mutationFn: () => customFetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgName, currency, timezone }) }),
    onSuccess: () => { toast({ title: "Настройки организации сохранены" }); qc.invalidateQueries({ queryKey: ["/api/settings"] }); },
    onError: () => toast({ title: "Ошибка сохранения", variant: "destructive" }),
  });

  if (isLoading) return <div className="py-8 text-center text-muted-foreground">Загрузка...</div>;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Параметры организации</CardTitle><CardDescription>Настройки отображаются во всём интерфейсе системы.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2"><Label>Название системы / организации</Label><Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Северное сияние" /></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Валюта</Label><Select value={currency} onValueChange={setCurrency}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CURRENCIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Часовой пояс</Label><Select value={timezone} onValueChange={setTimezone}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TIMEZONES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}><Save className="mr-2 h-4 w-4" />Сохранить</Button>
      </CardContent>
    </Card>
  );
}

function AddEmployeeDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("warehouse");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() { setFirstName(""); setLastName(""); setEmail(""); setPassword(""); setRole("warehouse"); setShowPwd(false); setError(null); }
  async function handleCreate() {
    if (!email.trim() || !password.trim()) { setError("Email и пароль обязательны"); return; }
    if (password.length < 8) { setError("Пароль должен быть не менее 8 символов"); return; }
    setLoading(true); setError(null);
    try {
      await customFetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ firstName, lastName, email, password, role }) });
      toast({ title: `Сотрудник ${email} добавлен` }); reset(); onOpenChange(false); onCreated();
    } catch (err: unknown) {
      setError((err as { data?: { error?: string } })?.data?.error ?? "Не удалось создать пользователя");
    } finally { setLoading(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Добавить сотрудника</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label className="text-xs">Имя</Label><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Иван" /></div><div className="space-y-1.5"><Label className="text-xs">Фамилия</Label><Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Петров" /></div></div>
          <div className="space-y-1.5"><Label className="text-xs">Email *</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ivan@example.com" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Временный пароль *</Label><div className="relative"><Input type={showPwd ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Минимум 8 символов" className="pr-10" /><button type="button" onClick={() => setShowPwd((p) => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">{showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
          <div className="space-y-1.5"><Label className="text-xs">Роль</Label><Select value={role} onValueChange={setRole}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(ROLE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
          {error && <p className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">{error}</p>}
          <div className="flex justify-end gap-2 pt-1"><Button variant="outline" onClick={() => { onOpenChange(false); reset(); }}>Отмена</Button><Button onClick={handleCreate} disabled={loading}>{loading ? "Создание..." : "Создать"}</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AccessSection() {
  const { canDo, user: me } = useCurrentUser();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const { data: users, isLoading } = useQuery<SystemUser[]>({ queryKey: ["/api/admin/users"], queryFn: () => customFetch("/api/admin/users").then((r) => r as SystemUser[]), enabled: canDo("admin") });
  const { data: locations } = useQuery<Location[]>({ queryKey: ["/api/locations"], queryFn: () => customFetch("/api/locations").then((r) => r as Location[]), enabled: canDo("admin") });

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: number; role: string }) => customFetch(`/api/admin/users/${id}/role`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) }),
    onSuccess: () => { toast({ title: "Роль изменена" }); qc.invalidateQueries({ queryKey: ["/api/admin/users"] }); },
    onError: () => toast({ title: "Ошибка изменения роли", variant: "destructive" }),
  });

  const changeLocation = useMutation({
    mutationFn: ({ id, locationId }: { id: number; locationId: number | null }) => customFetch(`/api/admin/users/${id}/location`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locationId }) }),
    onSuccess: () => { toast({ title: "Склад сотрудника назначен" }); qc.invalidateQueries({ queryKey: ["/api/admin/users"] }); },
    onError: (err: unknown) => toast({ title: (err as { data?: { error?: string } })?.data?.error ?? "Ошибка назначения склада", variant: "destructive" }),
  });

  const deleteUser = useMutation({
    mutationFn: (id: number) => customFetch(`/api/admin/users/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "Пользователь удалён" }); setDeletingId(null); qc.invalidateQueries({ queryKey: ["/api/admin/users"] }); },
    onError: (err: unknown) => { toast({ title: (err as { data?: { error?: string } })?.data?.error ?? "Ошибка удаления", variant: "destructive" }); setDeletingId(null); },
  });

  if (!canDo("admin")) return <Card><CardContent className="py-8 text-center text-muted-foreground">Раздел доступен только Завхозу.</CardContent></Card>;
  const userList = users ?? [];
  const locationName = (id: number | null) => locations?.find((l) => l.id === id)?.name ?? "Не назначен";

  return (
    <>
      <AddEmployeeDialog open={addOpen} onOpenChange={setAddOpen} onCreated={() => qc.invalidateQueries({ queryKey: ["/api/admin/users"] })} />
      <Dialog open={deletingId !== null} onOpenChange={(v) => { if (!v) setDeletingId(null); }}>
        <DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Удалить пользователя?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{(() => { const u = userList.find((x) => x.id === deletingId); return `Удалить ${[u?.firstName, u?.lastName].filter(Boolean).join(" ") || u?.email}? Это действие нельзя отменить.`; })()}</p>
          <div className="flex justify-end gap-2 pt-2"><Button variant="outline" onClick={() => setDeletingId(null)}>Отмена</Button><Button variant="destructive" disabled={deleteUser.isPending} onClick={() => deletingId && deleteUser.mutate(deletingId)}>Удалить</Button></div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3"><div><CardTitle className="text-base">Управление командой</CardTitle><CardDescription className="mt-1">Назначайте роль и склад каждому сотруднику.</CardDescription></div><Button size="sm" onClick={() => setAddOpen(true)}><Plus className="mr-2 h-4 w-4" />Добавить сотрудника</Button></CardHeader>
        <CardContent className="p-0">
          {isLoading ? <div className="py-8 text-center text-muted-foreground text-sm">Загрузка...</div> : !userList.length ? <div className="py-8 text-center text-muted-foreground text-sm">Нет зарегистрированных пользователей.</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Сотрудник</TableHead><TableHead>Роль</TableHead><TableHead>Склад</TableHead><TableHead>Зарегистрирован</TableHead><TableHead className="w-10" /></TableRow></TableHeader>
              <TableBody>{userList.map((u) => {
                const displayName = [u.firstName, u.lastName].filter(Boolean).join(" ") || "—";
                const isMe = u.clerkUserId === me?.clerkUserId;
                return <TableRow key={u.id}>
                  <TableCell><div className="flex flex-col"><span className="font-medium text-sm">{displayName}{isMe && <span className="ml-2 text-xs text-muted-foreground">(вы)</span>}</span><span className="text-xs text-muted-foreground">{u.email}</span></div></TableCell>
                  <TableCell><Select value={u.role} onValueChange={(role) => changeRole.mutate({ id: u.id, role })} disabled={isMe}><SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(ROLE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></TableCell>
                  <TableCell><Select value={u.locationId === null ? "none" : String(u.locationId)} onValueChange={(value) => changeLocation.mutate({ id: u.id, locationId: value === "none" ? null : Number(value) })} disabled={isMe || changeLocation.isPending}><SelectTrigger className="w-44 h-8"><Warehouse className="mr-2 h-4 w-4 text-muted-foreground" /><SelectValue placeholder="Не назначен" /></SelectTrigger><SelectContent><SelectItem value="none">Не назначен</SelectItem>{(locations ?? []).map((location) => <SelectItem key={location.id} value={String(location.id)}>{location.name}</SelectItem>)}</SelectContent></Select></TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(u.createdAt).toLocaleDateString("ru-RU")}</TableCell>
                  <TableCell>{!isMe && <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setDeletingId(u.id)}><Trash2 className="h-4 w-4" /></Button>}</TableCell>
                </TableRow>;
              })}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <div className="rounded-lg bg-muted/50 border p-4 text-xs text-muted-foreground space-y-1"><p className="font-medium text-foreground">Правило доступа</p><p>Кладовщик видит только назначенный ему склад.</p><p>Завхоз видит все семь складов и может менять назначения.</p><p>Если склад не назначен, сотрудник не получает доступ к складским остаткам.</p></div>
    </>
  );
}

function TelegramSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: status } = useQuery<{ botConnected: boolean; adminChatConfigured: boolean }>({ queryKey: ["/api/admin/telegram/status"], queryFn: () => customFetch("/api/admin/telegram/status").then((r) => r as { botConnected: boolean; adminChatConfigured: boolean }) });
  const { data: me } = useQuery<{ telegramChatId?: string | null }>({ queryKey: ["/api/auth/me"], queryFn: () => customFetch("/api/auth/me").then((r) => r as { telegramChatId?: string | null }) });
  const [chatId, setChatId] = useState("");
  useEffect(() => { if (me?.telegramChatId) setChatId(me.telegramChatId); }, [me?.telegramChatId]);
  const linkTelegram = useMutation({ mutationFn: () => customFetch("/api/admin/users/me/telegram", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ telegramChatId: chatId || null }) }), onSuccess: () => { toast({ title: chatId ? "Telegram привязан" : "Telegram отвязан" }); qc.invalidateQueries({ queryKey: ["/api/auth/me"] }); }, onError: () => toast({ title: "Ошибка", variant: "destructive" }) });

  return <div className="space-y-6">
    <Card><CardHeader><CardTitle className="text-base">Статус подключения бота</CardTitle></CardHeader><CardContent className="space-y-3">
      <div className="flex items-center gap-3">{status?.botConnected ? <CheckCircle className="h-5 w-5 text-emerald-600" /> : <XCircle className="h-5 w-5 text-destructive" />}<span className="text-sm">{status?.botConnected ? "Telegram-бот подключён" : "Telegram-бот не настроен"}</span></div>
      <div className="flex items-center gap-3">{status?.adminChatConfigured ? <CheckCircle className="h-5 w-5 text-emerald-600" /> : <XCircle className="h-5 w-5 text-destructive" />}<span className="text-sm">{status?.adminChatConfigured ? "Чат для уведомлений настроен" : "Чат администратора не настроен"}</span></div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Привязка вашего аккаунта к Telegram</CardTitle><CardDescription>Бот показывает меню с учётом вашей роли.</CardDescription></CardHeader><CardContent className="space-y-4">
      <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">Отправьте команду <code className="bg-background px-1 rounded">/myid</code> боту, чтобы узнать Chat ID.</div>
      <div className="space-y-2"><Label>Telegram Chat ID</Label><div className="flex gap-2"><Input value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="Например: 123456789" className="max-w-xs" /><Button onClick={() => linkTelegram.mutate()} disabled={linkTelegram.isPending}><Link className="mr-2 h-4 w-4" />Привязать</Button></div></div>
      {me?.telegramChatId && <div className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle className="h-4 w-4" />Привязан Chat ID: <code className="bg-muted px-1 rounded">{me.telegramChatId}</code><Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setChatId(""); linkTelegram.mutate(); }}>Отвязать</Button></div>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Уведомления</CardTitle><CardDescription>Автоматические уведомления администратора.</CardDescription></CardHeader><CardContent className="space-y-2 text-sm text-muted-foreground"><div><Badge variant="outline">⚠️ Низкий остаток</Badge> При падении ниже минимального порога</div><div><Badge variant="outline">🔴 Просрочена аренда</Badge> Проверяется каждый час</div></CardContent></Card>
  </div>;
}

export default function Settings() {
  const { canDo } = useCurrentUser();
  return <div className="space-y-6 max-w-4xl"><div><h1 className="text-2xl font-bold tracking-tight">Настройки</h1><p className="text-muted-foreground text-sm">Управление профилем, организацией и доступом.</p></div>
    <Tabs defaultValue="profile"><TabsList className="grid grid-cols-4 w-full"><TabsTrigger value="profile" className="gap-2 text-xs sm:text-sm"><User className="h-4 w-4" /><span className="hidden sm:inline">Профиль</span></TabsTrigger><TabsTrigger value="org" className="gap-2 text-xs sm:text-sm"><Building2 className="h-4 w-4" /><span className="hidden sm:inline">Организация</span></TabsTrigger><TabsTrigger value="access" className="gap-2 text-xs sm:text-sm" disabled={!canDo("admin")}><Shield className="h-4 w-4" /><span className="hidden sm:inline">Доступ</span></TabsTrigger><TabsTrigger value="telegram" className="gap-2 text-xs sm:text-sm"><MessageCircle className="h-4 w-4" /><span className="hidden sm:inline">Telegram</span></TabsTrigger></TabsList>
      <div className="mt-6"><TabsContent value="profile"><ProfileSection /></TabsContent><TabsContent value="org"><OrgSection /></TabsContent><TabsContent value="access"><AccessSection /></TabsContent><TabsContent value="telegram"><TelegramSection /></TabsContent></div>
    </Tabs>
  </div>;
}
