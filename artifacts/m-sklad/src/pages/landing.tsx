import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <header className="px-8 py-6 flex justify-between items-center border-b border-border">
        <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="M-Sklad" className="h-8" />
        <div className="space-x-4">
          <Link href="/sign-in">
            <Button variant="ghost" data-testid="link-signin">Sign In</Button>
          </Link>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-2xl text-center space-y-8">
          <h1 className="text-5xl font-bold tracking-tight text-foreground">
            Precision Inventory Control for Hospitality
          </h1>
          <p className="text-xl text-muted-foreground">
            The command center for restaurant operations. Track stock, manage receipts, and run audits with military precision.
          </p>
          <div className="flex justify-center">
            <Link href="/sign-in">
              <Button size="lg" className="h-12 px-8 text-lg" data-testid="btn-get-started">
                Access Command Center
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
