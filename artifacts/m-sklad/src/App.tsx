import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, useClerk, useAuth, useSession } from "@clerk/react";
import { ruRU } from "@clerk/localizations";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { shadcn } from "@clerk/themes";
import { Switch, Route, Redirect, useLocation, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AccessDenied from "@/components/AccessDenied";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Items from "@/pages/items";
import Categories from "@/pages/categories";
import Receipts from "@/pages/receipts";
import WriteOffs from "@/pages/write-offs";
import InventoryAudits from "@/pages/inventory-audits";
import Staff from "@/pages/staff";
import AuditLog from "@/pages/audit-log";
import Settings from "@/pages/settings";
import Rentals from "@/pages/rentals";
import Onboarding from "@/pages/onboarding";
import Reports from "@/pages/reports";
import Transfers from "@/pages/transfers";
import { AppLayout } from "@/components/layout";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { AppRole } from "@/hooks/useCurrentUser";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
function stripBase(path: string): string { return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path; }
if (!clerkPubKey) throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in environment");
const clerkAppearance = { theme: shadcn, cssLayerName: "clerk", options: { logoPlacement: "inside" as const, logoLinkUrl: basePath || "/", logoImageUrl: `${window.location.origin}${basePath}/logo.svg` }, variables: { colorPrimary: "hsl(190 80% 38%)", colorForeground: "hsl(20 14% 10%)", colorMutedForeground: "hsl(20 8% 40%)", colorDanger: "hsl(0 84% 60%)", colorBackground: "hsl(0 0% 100%)", colorInput: "hsl(0 0% 100%)", colorInputForeground: "hsl(20 14% 10%)", colorNeutral: "hsl(40 10% 88%)", fontFamily: "Inter, sans-serif", borderRadius: "0.5rem" }, elements: { rootBox: "w-full flex justify-center", cardBox: "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden shadow-lg border border-border", card: "!shadow-none !border-0 !bg-transparent !rounded-none", footer: "!shadow-none !border-0 !bg-transparent !rounded-none", headerTitle: "text-2xl font-bold tracking-tight text-foreground", headerSubtitle: "text-muted-foreground", formButtonPrimary: "bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm", logoBox: "mb-4", logoImage: "h-12 w-auto", main: "p-8" } };
function SignInPage() { return <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div>; }
function SignUpPage() { return <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} fallbackRedirectUrl={`${basePath}/onboarding`} /></div>; }
function HomeRedirect() { const { isLoaded, isSignedIn } = useAuth(); if (!isLoaded) return <div className="min-h-[100dvh] flex items-center justify-center bg-background"><div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>; if (isSignedIn) return <Redirect to="/dashboard" />; return <Redirect to="/sign-in" />; }
function ProtectedRoute({ component: Component }: { component: React.ComponentType }) { const { isLoaded, isSignedIn } = useAuth(); if (!isLoaded) return <div className="min-h-[100dvh] flex items-center justify-center"><div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>; if (!isSignedIn) return <Redirect to="/" />; return <AppLayout><Component /></AppLayout>; }
function RoleCheck({ component: Component, minRole }: { component: React.ComponentType; minRole: AppRole }) { const { canDo, isLoading } = useCurrentUser(); if (isLoading) return <div className="min-h-[100dvh] flex items-center justify-center"><div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>; if (!canDo(minRole)) return <AppLayout><AccessDenied /></AppLayout>; return <AppLayout><Component /></AppLayout>; }
function RoleProtectedRoute({ component: Component, minRole }: { component: React.ComponentType; minRole: AppRole }) { const { isLoaded, isSignedIn } = useAuth(); if (!isLoaded) return <div className="min-h-[100dvh] flex items-center justify-center"><div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>; if (!isSignedIn) return <Redirect to="/" />; return <RoleCheck component={Component} minRole={minRole} />; }
function OnboardingPage() { const { isLoaded, isSignedIn } = useAuth(); if (!isLoaded) return <div className="min-h-[100dvh] flex items-center justify-center"><div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>; if (!isSignedIn) return <Redirect to="/" />; return <Onboarding />; }
function ClerkAuthTokenProvider() { const { session } = useSession(); const queryClient = useQueryClient(); if (session) setAuthTokenGetter(() => session.getToken()); else setAuthTokenGetter(null); useEffect(() => { if (session) queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }); return () => setAuthTokenGetter(null); }, [session, queryClient]); return null; }
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 0, refetchOnMount: true, refetchOnWindowFocus: true } } });
function ClerkProviderWithRoutes() { const [, setLocation] = useLocation(); return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={{ ...ruRU, signIn: { ...ruRU.signIn, start: { ...ruRU.signIn?.start, title: "Войти в Северное сияние", subtitle: "Доступ к системе управления ярмаркой" } }, signUp: { ...ruRU.signUp, start: { ...ruRU.signUp?.start, title: "Создать аккаунт", subtitle: "Регистрация в системе «Северное сияние»" } } }} routerPush={(to) => setLocation(stripBase(to))} routerReplace={(to) => setLocation(stripBase(to), { replace: true })}><QueryClientProvider client={queryClient}><ClerkAuthTokenProvider /><Switch><Route path="/" component={HomeRedirect} /><Route path="/sign-in/*?" component={SignInPage} /><Route path="/sign-up/*?" component={SignUpPage} /><Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route><Route path="/items"><ProtectedRoute component={Items} /></Route><Route path="/transfers"><ProtectedRoute component={Transfers} /></Route><Route path="/categories"><RoleProtectedRoute component={Categories} minRole="manager" /></Route><Route path="/receipts"><ProtectedRoute component={Receipts} /></Route><Route path="/write-offs"><RoleProtectedRoute component={WriteOffs} minRole="accountant" /></Route><Route path="/inventory-audits"><ProtectedRoute component={InventoryAudits} /></Route><Route path="/rentals"><ProtectedRoute component={Rentals} /></Route><Route path="/staff"><RoleProtectedRoute component={Staff} minRole="manager" /></Route><Route path="/audit-log"><RoleProtectedRoute component={AuditLog} minRole="admin" /></Route><Route path="/reports"><RoleProtectedRoute component={Reports} minRole="admin" /></Route><Route path="/settings"><RoleProtectedRoute component={Settings} minRole="admin" /></Route><Route path="/onboarding"><OnboardingPage /></Route><Route component={NotFound} /></Switch></QueryClientProvider></ClerkProvider>; }
function App() { return <TooltipProvider><WouterRouter base={basePath}><ClerkProviderWithRoutes /></WouterRouter><Toaster /></TooltipProvider>; }
export default App;
