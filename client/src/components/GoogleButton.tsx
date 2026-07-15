import { useEffect, useRef } from "react";
import { loginWithGoogle } from "../api";
import type { AuthUser } from "../types";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

function loadGsi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.getElementById("gsi-script") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("load failed")));
      return;
    }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.id = "gsi-script";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("load failed"));
    document.head.appendChild(s);
  });
}

/** "Continue with Google" — renders Google's official button. Hidden if unconfigured. */
export function GoogleButton({
  onAuthed,
  onError,
}: {
  onAuthed: (u: AuthUser) => void;
  onError: (msg: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!CLIENT_ID || !ref.current) return;
    let mounted = true;
    loadGsi()
      .then(() => {
        if (!mounted || !ref.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: async (resp) => {
            try {
              onAuthed(await loginWithGoogle(resp.credential));
            } catch (e) {
              onError(e instanceof Error ? e.message : "Google sign-in failed");
            }
          },
        });
        window.google.accounts.id.renderButton(ref.current, {
          theme: "filled_black",
          size: "large",
          text: "continue_with",
          shape: "pill",
          width: 320,
          logo_alignment: "center",
        });
      })
      .catch(() => onError("Couldn't load Google sign-in."));
    return () => {
      mounted = false;
    };
  }, [onAuthed, onError]);

  if (!CLIENT_ID) return null;
  return <div ref={ref} className="flex justify-center" />;
}
