"use client";
import { useState } from "react";
import type { Theme } from "@/domain/appearance";

// A draft belongs to the settings visit; only an acknowledged save commits it.
export function useAppearancePreview(initialTheme: Theme, path: string) {
  const [state, setState] = useState<{
    saved: Theme;
    preview: Theme | null;
    path: string;
  }>({ saved: initialTheme, preview: null, path });
  // Layouts survive navigation. Discard a draft before rendering another route.
  if (state.path !== path) setState({ ...state, path, preview: null });
  return {
    theme: state.path === path ? (state.preview ?? state.saved) : state.saved,
    savedTheme: state.saved,
    previewTheme: (theme: Theme) =>
      setState((current) => ({ ...current, preview: theme })),
    commitTheme: (theme: Theme) =>
      setState((current) => ({
        ...current,
        saved: theme,
        preview: current.preview === theme ? null : current.preview,
      })),
    cancelPreview: () => setState((current) => ({ ...current, preview: null })),
  };
}
