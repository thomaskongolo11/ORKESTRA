import { cva, type VariantProps } from "class-variance-authority";
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const alertVariants = cva("flex gap-3 rounded-md border px-3.5 py-3 text-sm leading-relaxed [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0", {
  variants: {
    variant: {
      error: "border-destructive/25 bg-destructive-soft text-destructive",
      success: "border-success/25 bg-success-soft text-success",
      warning: "border-warning/25 bg-warning-soft text-warning",
      info: "border-electric/25 bg-electric/8 text-navy-700",
    },
  },
  defaultVariants: { variant: "info" },
});

const icons = { error: AlertCircle, success: CheckCircle2, warning: TriangleAlert, info: Info } as const;

export function Alert({ className, variant = "info", children, ...props }: ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  const Icon = icons[variant ?? "info"];
  return (
    <div role={variant === "error" ? "alert" : "status"} className={cn(alertVariants({ variant }), className)} {...props}>
      <Icon aria-hidden />
      <div>{children}</div>
    </div>
  );
}
