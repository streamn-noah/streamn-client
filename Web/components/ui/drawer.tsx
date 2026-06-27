"use client";

import { Drawer as DrawerPrimitive } from "vaul";
import { X } from "lucide-react";
import type { ComponentPropsWithoutRef } from "react";

export const Drawer = DrawerPrimitive.Root;
export const DrawerTrigger = DrawerPrimitive.Trigger;
export const DrawerClose = DrawerPrimitive.Close;
export const DrawerTitle = DrawerPrimitive.Title;
export const DrawerDescription = DrawerPrimitive.Description;

export function DrawerContent({
  className = "",
  children,
  ...props
}: ComponentPropsWithoutRef<typeof DrawerPrimitive.Content>) {
  return (
    <DrawerPrimitive.Portal>
      <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm" />
      <DrawerPrimitive.Content
        className={`fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-hidden rounded-t-[24px] border border-white/10 bg-black shadow-2xl outline-none ${className}`}
        {...props}
      >
        <div className="mx-auto mt-3 h-1.5 w-16 rounded-full bg-white/30" />
        {children}
        <DrawerPrimitive.Close className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-black/35 text-white/80 backdrop-blur transition hover:bg-white/15 hover:text-white">
          <X className="size-5" />
          <span className="sr-only">Close</span>
        </DrawerPrimitive.Close>
      </DrawerPrimitive.Content>
    </DrawerPrimitive.Portal>
  );
}
