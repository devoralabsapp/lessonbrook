import type { ReactNode } from "react";
import { Pin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "./ui/card";

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
