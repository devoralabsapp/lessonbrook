"use client";

import { useState, type FormEvent } from "react";

// The native shell reads this marker before leaving the current form. Values
// stay in the form itself, including after an unsuccessful save.
export function useMobileDraft(saving: boolean, initiallyDirty = false) {
  const [dirty, setDirty] = useState(initiallyDirty);
  return {
    changed: () => setDirty(true),
    saved: () => setDirty(false),
    form: {
      "data-mobile-draft": saving ? "saving" : dirty ? "dirty" : "clean",
      onChangeCapture(event: FormEvent<HTMLFormElement>) {
        if (
          !(event.target instanceof Element) ||
          !event.target.closest("[data-draft-ignore], input[type=search]")
        )
          setDirty(true);
      },
    },
  };
}
