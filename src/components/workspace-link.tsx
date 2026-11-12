"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

export function useDemoWorkspace() {
  const pathname = usePathname();
  return pathname === "/demo" || pathname.startsWith("/demo/");
}

export function useWorkspaceHref() {
  const demo = useDemoWorkspace();
  return (href: string) =>
    demo
      ? href
          .replace(/^\/app(?=\/|\?|#|$)/, "/demo")
          .replace(/^\/onboarding(?=\?|#|$)/, "/demo/onboarding")
      : href;
}

export default function WorkspaceLink({
  href,
  ...props
}: ComponentProps<typeof Link>) {
  const workspaceHref = useWorkspaceHref();
  return (
    <Link
      {...props}
      href={typeof href === "string" ? workspaceHref(href) : href}
    />
  );
}
