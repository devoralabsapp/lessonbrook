"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function HomeLedgerMotion({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scene = ref.current;
    if (!scene || typeof IntersectionObserver === "undefined") return;

    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    let inView = false;
    let armed = true;
    const settle = () => delete scene.dataset.ledgerMotion;

    const syncMotion = () => {
      if (reducedMotion.matches || document.hidden) {
        settle();
      } else if (inView && armed) {
        armed = false;
        scene.dataset.ledgerMotion = "playing";
      }
    };

    // Measure the stationary panel and animate only its decorative children.
    const entrance = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting && entry.intersectionRatio >= 0.25;
        syncMotion();
      },
      { threshold: 0.25 },
    );
    // Rearm beyond the viewport so small scroll reversals cannot cause flicker.
    const departure = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) return;
        inView = false;
        armed = true;
        settle();
      },
      { rootMargin: "64px 0px" },
    );

    entrance.observe(scene);
    departure.observe(scene);
    document.addEventListener("visibilitychange", syncMotion);
    reducedMotion.addEventListener("change", syncMotion);
    return () => {
      entrance.disconnect();
      departure.disconnect();
      document.removeEventListener("visibilitychange", syncMotion);
      reducedMotion.removeEventListener("change", syncMotion);
      settle();
    };
  }, []);

  return (
    <div
      ref={ref}
      className="relative rounded-[32px] bg-accent-soft p-5 sm:p-9"
      data-slot="home-ledger"
    >
      {children}
    </div>
  );
}
