import type { ReactNode } from "react";
import { Pin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "./ui/card";
import Link from "./workspace-link";

const colors = ["lemon", "rose", "sky", "mint", "lilac", "peach"] as const;

function paperColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++)
    hash = (Math.imul(hash, 31) + id.charCodeAt(i)) >>> 0;
  return colors[hash % colors.length];
}

export function RecordNote({
  note,
  recordId,
  tone,
  card = false,
  className,
  children,
}: {
  note: boolean;
  recordId: string;
  tone: string;
  card?: boolean;
  className?: string;
  children: ReactNode;
}) {
  if (note)
    return (
      <article
        data-note-color={paperColor(recordId)}
        className={cn("record-note", className)}
      >
        <Pin className="record-note-pin" aria-hidden="true" />
        {children}
      </article>
    );

  const Container = card ? Card : "div";
  return (
    <Container data-list-tone={tone} className={className}>
      {children}
    </Container>
  );
}

export function RecordIdentity({
  name,
  href,
  detail,
  note,
}: {
  name: string;
  href: string;
  detail?: string;
  note: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-start gap-2 rounded-lg border border-border px-2 py-1.5">
      <span
        aria-hidden="true"
        className={cn(
          "grid shrink-0 place-items-center rounded-sm bg-accent-soft text-sm font-semibold text-primary",
          note ? "size-7" : "size-10",
        )}
      >
        {Array.from(name)[0]?.toUpperCase()}
      </span>
      <Link href={href} className="min-w-0 flex-1 self-center">
        <span className="block break-words text-sm font-semibold">{name}</span>
        {detail && (
          <span className="mt-1 block break-words text-xs text-muted-foreground">
            {detail}
          </span>
        )}
      </Link>
    </div>
  );
}
