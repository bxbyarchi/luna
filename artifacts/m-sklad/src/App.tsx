import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useAuth, useSession } from "@clerk/react";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, Redirect, useLocation, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Landing from "@/pages/landing";
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

import { AppLayout } from "@/components/layout";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { AppRole } from "@/hooks/useCurrentUser";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env file");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(152 69% 31%)",
    colorForeground: "hsl(20 14% 10%)",
    colorMutedForeground: "hsl(20 8% 40%)",
    colorDanger: "hsl(0 84% 60%)",
    colorBackground: "hsl(0 0% 100%)",
    colorInput: "hsl(0 0% 100%)",
    colorInputForeground: "hsl(20 14% 10%)",
    colorNeutral: "hsl(40 10% 88%)",
    fontFamily: "Inter, sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden shadow-lg border border-border",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-2xl font-bold tracking-tight text-foreground",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButtonText: "text-foreground font-medium",
    formFieldLabel: "text-foreground font-medium",
    footerActionLink: "text-primary hover:text-primary/90 font-medium",
    footerActionText: "text-muted-foreground",
    dividerText: "text-muted-foreground",
    identityPreviewEditButton: "text-primary hover:text-primary/90",
    formFieldSuccessText: "text-primary",
    alertText: "text-destructive-foreground",
    logoBox: "mb-4",
    logoImage: "h-12 w-auto",
    socialButtonsBlockButton: "border-border hover:bg-secondary",
    formButtonPrimary: "bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm",
    formFieldInput: "border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
    footerAction: "bg-muted/50 p-4 border-t border-border",
    dividerLine: "bg-border",
    alert: "bg-destructive text-destructive-foreground",
    otpCodeFieldInput: "border-input border",
    formFieldRow: "mb-4",
    main: "p-8",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-muted/30 px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-muted/30 px-4">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        afterSignUpUrl={`${basePath}/onboarding`}
      />
    </div>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isSignedIn) {
    return <Redirect to="/" />;
  }

  return (
    <AppLayout>
      <Component />
    </AppLayout>
  );
}

/**
 * Inner component rendered only when the user is confirmed signed-in.
 * Checks the user's role from the API and either renders the page or
 * redirects to /dashboard. Only shows a spinner while the first
 * /api/auth/me fetch is in-flight (isLoading). Once the fetch settles
 * (success or all retries exhausted), the role decision is made
 * immediately so there is no indefinite spinner.
 */
function RoleCheck({ component: Component, minRole }: { component: React.ComponentType; minRole: AppRole }) {
  const { canDo, isLoading } = useCurrentUser();

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!canDo(minRole)) {
    return <Redirect to="/dashboard" />;
  }

  return (
    <AppLayout>
      <Component />
    </AppLayout>
  );
}

function RoleProtectedRoute({ component: Component, minRole }: { component: React.ComponentType; minRole: AppRole }) {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isSignedIn) {
    return <Redirect to="/" />;
  }

  // Only mount RoleCheck once Clerk is loaded and the session is established.
  // This ensures the auth token getter is set before useGetMe fires its first request.
  return <RoleCheck component={Component} minRole={minRole} />;
}

function OnboardingPage() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }
  if (!isSignedIn) return <Redirect to="/" />;
  return <Onboarding />;
}

/**
 * Wires Clerk's session token into every customFetch API call via the
 * Authorization: Bearer header. This bypasses the dev-browser-missing
 * cookie issue when the Replit proxy separates the frontend and API ports.
 *
 * Uses useSession() which gives direct access to the active Session object.
 * session.getToken() is the most reliable way to get a fresh JWT in Clerk v5.
 */
function ClerkAuthTokenProvider() {
  const { session } = useSession();
  const queryClient = useQueryClient();

  // Set synchronously during render so the token is attached BEFORE
  // react-query fires its first fetch in any child component.
  if (session) {
    setAuthTokenGetter(() => session.getToken());
  } else {
    setAuthTokenGetter(null);
  }

  useEffect(() => {
    if (session) {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    }
    return () => {
      setAuthTokenGetter(null);
    };
  }, [session, queryClient]);

  return null;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      refetchOnMount: true,
      refetchOnWindowFocus: true,
    },
  },
});

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      clerkJSUrl="https://cdn.jsdelivr.net/npm/@clerk/clerk-js@6/dist/clerk.browser.js"
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Войти в M-Sklad",
            subtitle: "Введите данные для доступа к системе управления складом",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkAuthTokenProvider />
        <ClerkQueryClientCacheInvalidator />
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
          <Route path="/items"><ProtectedRoute component={Items} /></Route>
          <Route path="/categories"><ProtectedRoute component={Categories} /></Route>
          <Route path="/receipts"><ProtectedRoute component={Receipts} /></Route>
          <Route path="/write-offs"><ProtectedRoute component={WriteOffs} /></Route>
          <Route path="/inventory-audits"><ProtectedRoute component={InventoryAudits} /></Route>
          <Route path="/rentals"><ProtectedRoute component={Rentals} /></Route>
          <Route path="/staff"><ProtectedRoute component={Staff} /></Route>
          <Route path="/audit-log"><RoleProtectedRoute component={AuditLog} minRole="admin" /></Route>
          <Route path="/reports"><ProtectedRoute component={Reports} /></Route>
          <Route path="/settings"><RoleProtectedRoute component={Settings} minRole="admin" /></Route>
          <Route path="/onboarding"><OnboardingPage /></Route>
          <Route component={NotFound} />
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <TooltipProvider>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;