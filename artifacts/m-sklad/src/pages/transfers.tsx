import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { ArrowRight, Check, X, Plus, Truck, Clock3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const statusLabels: Record<string, string> = { pending: "Ожидает приёмки", accepted: "Принято", rejected: "Отклонено", cancelled: "Отменено" };

export default function Transfers() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const { data: user } = useQuery<any>({ queryKey: ["/api/auth/me"], queryFn: () => customFetch("/api/auth/me") });
  const { data: locations = [] } = useQuery<any[]>({ queryKey: ["/api/locations"], queryFn: () => customFetch("/api/locations") });
  const { data: items = [] } = useQuery<any[]>({ queryKey: ["/api/items", from], queryFn: () => customFetch(`/api/items${from ? `?locationId=${from}` : ""}`), enabled: !!from });
  const { data: transfers = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/transfers"], queryFn: () => customFetch("/api/transfers") });

  useEffect(() => {
    if (user?.role !== "admin" && user?.locationId) setFrom(String(user.locationId));
    if (user?.role === "admin" && !from && locations.length) setFrom(String(locations[0].id));
  }, [user, locations, from]);

  useEffect(() => { setItemId(""); setQuantity(""); }, [from]);

  const mutate = useMutation({
    mutationFn: async ({ url, method, body }: { url: string; method: string; body?: unknown }) => customFetch(url, { method, body: body ? JSON.stringify(body) : undefined, headers: { "Content-Type": "application/json" } }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/transfers"] }); queryClient.invalidateQueries({ queryKey: ["/api/items"] }); },
    onError: (error: any) => toast({ title: "Ошибка", description: error?.message || "Операция не выполнена", variant: "destructive" }),
  });

  function createTransfer() {
    if (!from || !to || !itemId || !quantity) return;
    mutate.mutate({ url: "/api/transfers", method: "POST", body: { fromLocationId: Number(from), toLocationId: Number(to), itemId: Number(itemId), quantity: Number(quantity), note } });
    setFormOpen(false); setTo(""); setItemId(""); setQuantity(""); setNote("");
  }
  const locationName = (id: number) => locations.find((x) => x.id === id)?.name ?? `Склад #${id}`;
  const canAccept = (t: any) => t.status === "pending" && (user?.role === "admin" || user?.locationId === t.toLocationId);

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold tracking-tight">Перемещения</h1><p className="text-muted-foreground">Передача товара между складами «Северного сияния»</p></div><Button onClick={() => setFormOpen((v) => !v)}><Plus className="mr-2 h-4 w-4" />Создать перемещение</Button></div>
    {formOpen && <Card><CardHeader><CardTitle>Новое перемещение</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2"><Label>Склад отправитель</Label><Select value={from} onValueChange={setFrom} disabled={user?.role !== "admin"}><SelectTrigger><SelectValue placeholder="Выберите склад" /></SelectTrigger><SelectContent>{locations.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label>Склад получатель</Label><Select value={to} onValueChange={setTo}><SelectTrigger><SelectValue placeholder="Выберите склад" /></SelectTrigger><SelectContent>{locations.filter((l) => String(l.id) !== from).map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label>Товар</Label><Select value={itemId} onValueChange={setItemId}><SelectTrigger><SelectValue placeholder="Выберите товар" /></SelectTrigger><SelectContent>{items.map((i) => <SelectItem key={i.id} value={String(i.id)}>{i.name} ({i.currentStock} {i.unit})</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label>Количество</Label><Input type="number" min="0.001" step="0.001" max={itemId ? Number(items.find((i) => String(i.id) === itemId)?.currentStock ?? 0) : undefined} value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
      <div className="space-y-2 md:col-span-2"><Label>Примечание</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например: доставка на точку" /></div>
      <div className="flex gap-2 md:col-span-2"><Button onClick={createTransfer} disabled={mutate.isPending || !itemId || !quantity}>Отправить</Button><Button variant="outline" onClick={() => setFormOpen(false)}>Отмена</Button></div>
    </CardContent></Card>}
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Truck className="h-5 w-5" />История перемещений</CardTitle></CardHeader><CardContent>
      {isLoading ? <p className="text-muted-foreground">Загрузка...</p> : transfers.length === 0 ? <p className="py-8 text-center text-muted-foreground">Перемещений пока нет</p> : <div className="space-y-3">{transfers.slice().reverse().map((t) => <div key={t.id} className="rounded-xl border p-4"><div className="flex flex-wrap items-center gap-3"><div className="font-medium">{t.itemName}</div><Badge variant={t.status === "pending" ? "secondary" : t.status === "accepted" ? "default" : "destructive"}>{statusLabels[t.status] ?? t.status}</Badge><span className="text-sm text-muted-foreground">{t.quantity} {t.unit}</span></div><div className="mt-2 flex flex-wrap items-center gap-2 text-sm"><span>{t.fromLocationName}</span><ArrowRight className="h-4 w-4" /><span>{locationName(t.toLocationId)}</span></div>{t.note && <p className="mt-2 text-sm text-muted-foreground">{t.note}</p>}<div className="mt-3 flex items-center justify-between gap-3"><span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3 w-3" />{new Date(t.createdAt).toLocaleString("ru-RU")}</span>{canAccept(t) && <div className="flex gap-2"><Button size="sm" onClick={() => mutate.mutate({ url: `/api/transfers/${t.id}/accept`, method: "POST" })}><Check className="mr-1 h-4 w-4" />Принять</Button><Button size="sm" variant="outline" onClick={() => mutate.mutate({ url: `/api/transfers/${t.id}/reject`, method: "POST" })}><X className="mr-1 h-4 w-4" />Отклонить</Button></div>}</div></div>)}</div>}
    </CardContent></Card>
  </div>;
}
