import { cn } from "@/lib/utils";

export function BGPattern({
  variant = "grid",
  mask = "fade-edges",
  className,
}: {
  variant?: "grid" | "dots";
  mask?: "fade-edges" | "fade-center" | "none";
  className?: string;
}) {
  const maskCss: Record<string, string> = {
    "fade-edges":
      "[mask-image:radial-gradient(ellipse_at_center,var(--color-background),transparent)]",
    "fade-center":
      "[mask-image:radial-gradient(ellipse_at_center,transparent,var(--color-background))]",
    none: "",
  };
  const bgImage =
    variant === "grid"
      ? "linear-gradient(to right, rgba(99,91,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(99,91,255,0.06) 1px, transparent 1px)"
      : "radial-gradient(rgba(99,91,255,0.08) 1px, transparent 1px)";
  return (
    <div
      className={cn(
        "absolute inset-0 z-0 size-full pointer-events-none",
        maskCss[mask] ?? "",
        className,
      )}
      style={{ backgroundImage: bgImage, backgroundSize: "24px 24px" }}
    />
  );
}

export function GlowCard({
  children,
  className,
  glowColor: _glowColor,
}: {
  children: React.ReactNode;
  className?: string;
  /** @deprecated no longer used — kept for API compatibility */
  glowColor?: "purple" | "magenta" | "teal";
}) {
  return (
    <div
      className={cn(
        "rounded-xl bg-[#0F2F4F] border border-white/[0.08]",
        className,
      )}
    >
      {children}
    </div>
  );
}
