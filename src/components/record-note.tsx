"use client";

import type { ReactNode } from "react";
import { observeNoteMotion } from "@/lib/note-motion";
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
        ref={observeNoteMotion}
        data-note-color={paperColor(recordId)}
        className={cn("record-note", className)}
      >
        <NotePin id={recordId} />
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

function NotePin({ id }: { id: string }) {
  const cap = `note-pin-cap-${id}`;
  const body = `note-pin-body-${id}`;
  return (
    <svg
      className="record-note-pin"
      viewBox="0 0 36 42"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={cap} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#ff8896" />
          <stop offset=".45" stopColor="#ef334f" />
          <stop offset="1" stopColor="#a9112c" />
        </linearGradient>
        <linearGradient id={body} x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#ff6278" />
          <stop offset=".5" stopColor="#dc2340" />
          <stop offset="1" stopColor="#93112b" />
        </linearGradient>
      </defs>
      <ellipse cx="21" cy="29" rx="10" ry="3" fill="#211f1b" opacity=".22" />
      <path
        d="M13 12c1 5 1 8-3 12-4 5 20 7 16 0-4-4-4-7-3-12Z"
        fill={`url(#${body})`}
        stroke="#96142c"
        strokeWidth="1"
      />
      <path
        d="M15 16c1 4 0 7-3 9"
        fill="none"
        stroke="#ffb2bd"
        strokeWidth="1.5"
        opacity=".7"
      />
      <ellipse cx="18" cy="12" rx="11" ry="5" fill="#94132a" />
      <path
        d="M7 8v4c0 7 22 7 22 0V8Z"
        fill={`url(#${body})`}
        stroke="#96142c"
        strokeWidth="1"
      />
      <ellipse
        cx="18"
        cy="8"
        rx="11"
        ry="5"
        fill={`url(#${cap})`}
        stroke="#a51a33"
        strokeWidth="1"
      />
      <ellipse cx="15" cy="6.5" rx="6" ry="1.8" fill="#ffe1e4" opacity=".65" />
    </svg>
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
    <div className="record-identity flex min-w-0 flex-1 items-start gap-2 rounded-xl border-2 border-primary px-2 py-1.5">
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
        <span className="record-identity-name block break-words text-base leading-snug font-extrabold text-foreground">
          {name}
        </span>
        {detail && (
          <span className="mt-1 block break-words text-xs text-muted-foreground">
            {detail}
          </span>
        )}
      </Link>
    </div>
  );
}
