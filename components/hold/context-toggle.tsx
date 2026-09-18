"use client";

import { BubbleChatIcon, CustomerService01Icon, Mail01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { HoldContext } from "@/packages/core";

interface ContextToggleProps {
  value: HoldContext;
  onChange: (value: HoldContext) => void;
  disabled?: boolean;
}

const contextOptions: Array<{
  value: HoldContext;
  label: string;
  icon: typeof Mail01Icon;
}> = [
  { value: "email", label: "Email", icon: Mail01Icon },
  { value: "social-post", label: "Social post", icon: BubbleChatIcon },
  { value: "support-reply", label: "Support reply", icon: CustomerService01Icon },
];

export function ContextToggle({ value, onChange, disabled }: ContextToggleProps) {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(val) => {
        if (val.length > 0 && val[0]) {
          onChange(val[0] as HoldContext);
        }
      }}
      disabled={disabled}
      variant="outline"
      spacing={1}
      aria-label="Communication context"
      className="w-full sm:w-auto grid grid-cols-3 sm:flex p-0.5 bg-muted/40 rounded-xl border border-border/80"
    >
      {contextOptions.map((opt) => (
        <ToggleGroupItem
          key={opt.value}
          value={opt.value}
          className="h-8 px-3 text-xs font-medium rounded-lg transition-all data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-xs data-[state=on]:font-semibold data-[state=off]:text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon icon={opt.icon} strokeWidth={2} data-icon="inline-start" className="size-3.5" />
          <span>{opt.label}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
