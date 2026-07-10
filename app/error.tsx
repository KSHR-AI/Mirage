"use client";

import { RotateCcw } from "lucide-react";
import { useEffect } from "react";

export default function ErrorScreen({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    console.error("Mirage runtime failure", error);
  }, [error]);

  return (
    <main className="runtime-error" role="alert">
      <div className="runtime-error__brand">
        <strong>MIRAGE</strong>
        <span>AFTERLIGHT / LINK LOST</span>
      </div>
      <div className="runtime-error__body">
        <p>WORLD 01</p>
        <h1>The city stopped responding.</h1>
        <span>
          Retry the renderer. Your latest stored checkpoint remains available
          from the title screen.
        </span>
        <button onClick={reset} type="button">
          <RotateCcw aria-hidden="true" size={18} strokeWidth={2.1} />
          Retry renderer
        </button>
      </div>
    </main>
  );
}
