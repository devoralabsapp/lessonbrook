"use client";

// One observer per page, rather than one observer or scroll listener per note.
const notes = new Set<HTMLElement>();
const visible = new Set<HTMLElement>();
let observer: IntersectionObserver | undefined;

function syncVisibility() {
  for (const note of notes)
    note.toggleAttribute(
      "data-note-visible",
      visible.has(note) && document.visibilityState !== "hidden",
    );
}

export function observeNoteMotion(note: HTMLElement | null) {
  if (!note || typeof IntersectionObserver === "undefined") return;
  if (!observer) {
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const target = entry.target as HTMLElement;
        if (!notes.has(target)) continue;
        if (entry.isIntersecting) visible.add(target);
        else visible.delete(target);
        target.toggleAttribute(
          "data-note-visible",
          entry.isIntersecting && document.visibilityState !== "hidden",
        );
      }
    });
    document.addEventListener("visibilitychange", syncVisibility);
  }
  notes.add(note);
  observer.observe(note);
  return () => {
    observer?.unobserve(note);
    notes.delete(note);
    visible.delete(note);
    if (!notes.size) {
      observer?.disconnect();
      observer = undefined;
      document.removeEventListener("visibilitychange", syncVisibility);
    }
  };
}
