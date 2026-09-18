import { Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type HugeiconsIconProps } from "@hugeicons/react";
import { cn } from "cn";

function Spinner({ className, strokeWidth = 2, ...props }: Omit<HugeiconsIconProps, "icon">) {
  return (
    <HugeiconsIcon
      icon={Loading03Icon}
      strokeWidth={strokeWidth}
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
