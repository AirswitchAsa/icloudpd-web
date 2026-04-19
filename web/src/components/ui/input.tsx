import { cn } from "@/lib/cn";
import type { InputHTMLAttributes } from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export function Input({ invalid, className, ...rest }: Props) {
  return (
    <input
      {...rest}
      className={cn(
        "w-full rounded-md border px-3 py-1.5 text-sm outline-none",
        invalid
          ? "border-danger focus:ring-1 focus:ring-danger"
          : "border-slate-300 focus:ring-1 focus:ring-accent",
        className
      )}
    />
  );
}
