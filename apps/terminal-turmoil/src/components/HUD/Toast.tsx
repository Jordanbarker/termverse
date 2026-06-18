"use client";

import { useEffect } from "react";
import { useGameStore } from "../../state/gameStore";

const TOAST_DURATION_MS = 4000;

export default function Toast() {
  const toasts = useGameStore((s) => s.toasts);
  const removeToast = useGameStore((s) => s.removeToast);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => {
      removeToast(toasts[0].id);
    }, TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toasts, removeToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="absolute bottom-12 right-2 z-20 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="bg-[#1a1f29]/90 border border-[#58a6ff]/40 rounded-md
            backdrop-blur-sm font-mono text-xs text-[#c9d1d9]
            px-3 py-2 max-w-[280px] animate-slide-in"
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
