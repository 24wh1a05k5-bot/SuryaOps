import * as M from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;

export function MenuContent({ children, align = "end" }: { children: ReactNode; align?: "start" | "end" }) {
  return (
    <M.Portal>
      <M.Content align={align} sideOffset={6} className="z-50 min-w-[200px] rounded-md bg-raised p-1 shadow-pop animate-pop">
        {children}
      </M.Content>
    </M.Portal>
  );
}

export function MenuItem({ children, onSelect, active, icon }: { children: ReactNode; onSelect?: () => void; active?: boolean; icon?: ReactNode }) {
  return (
    <M.Item onSelect={onSelect}
      className={cn("flex cursor-pointer select-none items-center gap-2 rounded px-2.5 py-2 text-base outline-none data-[highlighted]:bg-sunken",
        active && "font-medium text-ink")}>
      {icon && <span className="text-muted">{icon}</span>}
      <span className="flex-1">{children}</span>
      {active && <span className="h-1.5 w-1.5 rounded-full bg-sun" />}
    </M.Item>
  );
}

export const MenuSeparator = () => <M.Separator className="my-1 h-px bg-line" />;
export const MenuLabel = ({ children }: { children: ReactNode }) => <M.Label className="px-2.5 py-1.5 text-sm text-muted">{children}</M.Label>;
