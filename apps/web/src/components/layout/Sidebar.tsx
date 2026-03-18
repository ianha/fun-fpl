import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Calendar,
  Menu,
  TrendingUp,
  Shield,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/players", label: "Players", icon: Users },
  { to: "/fixtures", label: "Fixtures", icon: Calendar },
  { to: "/chat", label: "AI Chat", icon: MessageSquare },
] as const;

function SidebarContent({ onItemClick }: { onItemClick?: () => void }) {
  const location = useLocation();

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="border-b border-white/[0.08] p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#635BFF] to-[#635BFF]/70">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="font-display text-base font-bold text-white tracking-wide">
              FPL Analytics
            </h1>
            <p className="text-[10px] text-white/50 uppercase tracking-widest">
              Fantasy Premier League
            </p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 p-3">
        <p className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-[#8899AA]">
          Navigation
        </p>
        {navItems.map(({ to, label, icon: Icon }) => {
          const isActive =
            to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              onClick={onItemClick}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 cursor-pointer",
                isActive
                  ? "bg-[#635BFF]/10 border-l-2 border-[#635BFF] text-white"
                  : "text-[#8899AA] hover:bg-white/5 hover:text-white border-l-2 border-transparent",
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0 transition-colors",
                  isActive ? "text-[#635BFF]" : "text-[#8899AA] group-hover:text-white/80",
                )}
              />
              <span>{label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/[0.08] p-4">
        <div className="flex items-center gap-2.5 rounded-lg bg-accent/10 px-3 py-2.5 ring-1 ring-accent/20">
          <div className="h-2 w-2 rounded-full bg-accent animate-pulse shrink-0" />
          <div>
            <p className="text-xs font-semibold text-accent">Live Data</p>
            <p className="text-[10px] text-[#8899AA]">Updated this GW</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile header bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between border-b border-white/[0.08] bg-[#0A2540]/95 px-4 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#635BFF] to-[#635BFF]/70">
            <TrendingUp className="h-4 w-4 text-white" />
          </div>
          <span className="font-display text-sm font-bold text-white">FPL Analytics</span>
        </div>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-64 border-white/[0.08] bg-[#0A2540] p-0"
          >
            <SidebarContent onItemClick={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-60 shrink-0 h-screen sticky top-0 border-r border-white/[0.08] bg-[#0A2540]">
        <SidebarContent />
      </aside>
    </>
  );
}
