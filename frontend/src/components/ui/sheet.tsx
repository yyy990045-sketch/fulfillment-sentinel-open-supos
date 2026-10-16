import { useRef, type ComponentProps } from "react";
import { Dialog as SheetPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "../../lib/utils.js";

// shadcn/ui Sheet, adapted from the official Radix registry to the product tokens.
export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;

export function SheetContent({ className, children, onOpenAutoFocus, onCloseAutoFocus, ...props }: ComponentProps<typeof SheetPrimitive.Content>) {
  const returnFocus = useRef<HTMLElement | null>(null);
  return <SheetPrimitive.Portal>
    <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/15 backdrop-blur-[2px] data-[state=open]:animate-[overlay-in_.2s_ease-out]" />
    <SheetPrimitive.Content
      data-slot="sheet-content"
      className={cn("fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col gap-6 border-l border-border bg-background p-7 shadow-xl outline-none data-[state=open]:animate-[sheet-in_.24s_ease-out] sm:p-9", className)}
      {...props}
      onOpenAutoFocus={event => { returnFocus.current = document.activeElement as HTMLElement; onOpenAutoFocus?.(event); }}
      onCloseAutoFocus={event => { onCloseAutoFocus?.(event); if (!event.defaultPrevented) { event.preventDefault(); if (returnFocus.current?.isConnected) returnFocus.current.focus(); } }}
    >
      {children}
      <SheetPrimitive.Close className="absolute right-5 top-5 rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        <X className="size-4" /><span className="sr-only">关闭详情</span>
      </SheetPrimitive.Close>
    </SheetPrimitive.Content>
  </SheetPrimitive.Portal>;
}
export function SheetHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-2 pr-8", className)} {...props} />;
}
export function SheetTitle({ className, ...props }: ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title className={cn("text-2xl font-semibold tracking-tight", className)} {...props} />;
}
export function SheetDescription({ className, ...props }: ComponentProps<typeof SheetPrimitive.Description>) {
  return <SheetPrimitive.Description className={cn("text-sm leading-6 text-muted-foreground", className)} {...props} />;
}
