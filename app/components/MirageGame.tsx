"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  LingbotMainVideoView,
  LingbotProvider,
  useLingbot,
  useLingbotImageAccepted,
  useLingbotState,
  type LingbotStateMessage,
} from "@reactor-models/lingbot";

type Movement = "idle" | "forward" | "back" | "strafe_left" | "strafe_right";
type LookH = "idle" | "left" | "right";
type LookV = "idle" | "up" | "down";
type AccountState = {
  loading: boolean;
  user: { id: string; email?: string | null } | null;
  subscription: {
    status: string | null;
    stripe_customer_id?: string | null;
  } | null;
  canGenerate: boolean;
};

const TOKEN_CACHE_SKEW_SECONDS = 60;
const IMAGE_ACCEPT_TIMEOUT_MS = 15_000;
type TokenCacheEntry = { jwt: string; expiresAt: number };

async function fetchToken(cacheRef: RefObject<TokenCacheEntry | null>): Promise<string> {
  const cached = cacheRef.current;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (cached && cached.expiresAt - TOKEN_CACHE_SKEW_SECONDS > nowSeconds) {
    return cached.jwt;
  }

  const res = await fetch("/api/reactor/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Token request failed with ${res.status}`);
  }
  const { jwt, expires_at } = (await res.json()) as {
    jwt: string;
    expires_at: number;
  };
  cacheRef.current = { jwt, expiresAt: expires_at };
  return jwt;
}

export function MirageGame() {
  const [account, setAccount] = useState<AccountState>({
    loading: true,
    user: null,
    subscription: null,
    canGenerate: false,
  });
  const tokenCacheRef = useRef<TokenCacheEntry | null>(null);

  const refreshAccount = useCallback(async () => {
    const res = await fetch("/api/me", { cache: "no-store" });
    if (!res.ok) throw new Error("Could not load account.");
    const next = (await res.json()) as Omit<AccountState, "loading">;
    setAccount({ loading: false, ...next });
  }, []);

  useEffect(() => {
    void refreshAccount().catch(() => {
      setAccount({
        loading: false,
        user: null,
        subscription: null,
        canGenerate: false,
      });
    });
  }, [refreshAccount]);

  function clearSession() {
    tokenCacheRef.current = null;
  }

  if (account.loading) {
    return (
      <main className="setup-page">
        <section className="setup-panel">
          <p className="eyebrow">Mirage</p>
          <h1>Loading</h1>
        </section>
      </main>
    );
  }

  if (!account.user) {
    return <LoginGate onSignedIn={refreshAccount} />;
  }

  return (
    <LingbotProvider getJwt={() => fetchToken(tokenCacheRef)}>
      <GameShell
        account={account}
        onRefreshAccount={refreshAccount}
        onClearSession={clearSession}
      />
    </LingbotProvider>
  );
}

function LoginGate({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function signIn() {
    setSubmitting(true);
    setMessage("");
    try {
      const res = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Sign-in failed.");
      setMessage("Check your email for the Mirage sign-in link.");
      await onSignedIn();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign-in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="setup-page">
      <form
        className="setup-panel"
        onSubmit={(event) => {
          event.preventDefault();
          void signIn();
        }}
      >
        <p className="eyebrow">Mirage</p>
        <h1>Sign in to generate worlds</h1>
        <p>
          Mirage now uses a shared server-side Reactor key. Sign in first, then
          subscribe for $20/month when you are ready to generate a world.
        </p>
        <input
          aria-label="Email"
          autoComplete="email"
          autoCapitalize="none"
          className="key-input"
          onChange={(event) => setEmail(event.currentTarget.value)}
          placeholder="you@example.com"
          spellCheck={false}
          type="email"
          value={email}
        />
        <button
          className="primary wide"
          disabled={submitting || !email.includes("@")}
          type="submit"
        >
          {submitting ? "Sending..." : "Send sign-in link"}
        </button>
        {message ? <p className="setup-message">{message}</p> : null}
      </form>
    </main>
  );
}

function GameShell({
  account,
  onRefreshAccount,
  onClearSession,
}: {
  account: AccountState;
  onRefreshAccount: () => Promise<void>;
  onClearSession: () => void;
}) {
  const { status, connect, disconnect, lastError } = useLingbot();
  const [billingOpen, setBillingOpen] = useState(false);
  const [billingError, setBillingError] = useState("");
  const [billingBusy, setBillingBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") void onRefreshAccount();
  }, [onRefreshAccount]);

  async function signOut() {
    if (status !== "disconnected") disconnect();
    onClearSession();
    await fetch("/api/auth/sign-out", { method: "POST" });
    window.location.reload();
  }

  async function startCheckout() {
    setBillingBusy(true);
    setBillingError("");
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        subscribed?: boolean;
        url?: string;
      };
      if (!res.ok) throw new Error(body.error ?? "Could not start checkout.");
      if (body.subscribed) {
        await onRefreshAccount();
        setBillingOpen(false);
      } else if (body.url) {
        window.location.href = body.url;
      }
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : "Checkout failed.");
    } finally {
      setBillingBusy(false);
    }
  }

  return (
    <main className="game">
      <section className="stage">
        <LingbotMainVideoView
          className="video"
          videoObjectFit="cover"
          muted
        />
        <div className="hud top">
          <strong>Mirage</strong>
          <StatusLabel status={status} />
        </div>
        <div className="hud bottom">
          <span>WASD move</span>
          <span>Arrow keys look</span>
        </div>
      </section>

      <aside className="panel">
        <div>
          <p className="eyebrow">LingBot</p>
          <h1>Playable generative video</h1>
        </div>
        <AccountCard
          account={account}
          onRefreshAccount={onRefreshAccount}
          onSignOut={signOut}
        />

        <div className="connect-row">
          {status === "disconnected" ? (
            <button
              className="primary"
              onClick={() => {
                if (account.canGenerate) connect();
                else setBillingOpen(true);
              }}
            >
              {account.canGenerate ? "Connect" : "Subscribe to generate"}
            </button>
          ) : (
            <button className="secondary" onClick={() => disconnect()}>
              Disconnect
            </button>
          )}
        </div>

        {lastError ? <p className="error">{lastError.message}</p> : null}
        <StartScene
          canGenerate={account.canGenerate}
          onRequireBilling={() => setBillingOpen(true)}
        />
        {billingOpen && !account.canGenerate ? (
          <BillingCard
            busy={billingBusy}
            error={billingError}
            onCheckout={startCheckout}
          />
        ) : null}
        <NowPlaying />
        <Controls />
      </aside>
    </main>
  );
}

function AccountCard({
  account,
  onRefreshAccount,
  onSignOut,
}: {
  account: AccountState;
  onRefreshAccount: () => Promise<void>;
  onSignOut: () => void;
}) {
  async function openPortal() {
    const res = await fetch("/api/billing/portal", { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { url?: string };
    if (body.url) window.location.href = body.url;
  }

  return (
    <section className="card compact">
      <label className="label">Account</label>
      <p>{account.user?.email}</p>
      <div className="meta">
        <span>{account.canGenerate ? "subscription active" : "subscription needed"}</span>
        {account.subscription?.status ? <span>{account.subscription.status}</span> : null}
      </div>
      <div className="button-grid">
        <button className="secondary" onClick={() => void onRefreshAccount()}>
          Refresh
        </button>
        {account.subscription?.stripe_customer_id ? (
          <button className="secondary" onClick={() => void openPortal()}>
            Billing
          </button>
        ) : (
          <button className="secondary" onClick={onSignOut}>
            Sign out
          </button>
        )}
      </div>
      {account.subscription?.stripe_customer_id ? (
        <button className="secondary subtle" onClick={onSignOut}>
          Sign out
        </button>
      ) : null}
    </section>
  );
}

function BillingCard({
  busy,
  error,
  onCheckout,
}: {
  busy: boolean;
  error: string;
  onCheckout: () => void;
}) {
  return (
    <section className="card compact billing-card">
      <label className="label">Generate worlds</label>
      <h2>$20/month</h2>
      <p>Subscribe to start generating playable LingBot worlds with Mirage's Reactor key.</p>
      {error ? <p className="error">{error}</p> : null}
      <button className="primary wide" disabled={busy} onClick={onCheckout}>
        {busy ? "Opening checkout..." : "Subscribe and generate"}
      </button>
    </section>
  );
}

function StartScene({
  canGenerate,
  onRequireBilling,
}: {
  canGenerate: boolean;
  onRequireBilling: () => void;
}) {
  const { status, uploadFile, setImage, setPrompt, start } = useLingbot();
  const [snapshot, setSnapshot] = useState<LingbotStateMessage | null>(null);
  const [prompt, setPromptText] = useState(
    "First-person view inside a surreal ancient city made of luminous stone, narrow paths, huge carved doors, drifting mist, cinematic dusk light, explorable game world.",
  );
  const [uploading, setUploading] = useState(false);
  const [sceneError, setSceneError] = useState("");
  const imageReadyRef = useRef<(() => void) | null>(null);

  useLingbotState((msg) => setSnapshot(msg));
  useLingbotImageAccepted(() => {
    imageReadyRef.current?.();
    imageReadyRef.current = null;
  });

  useEffect(() => {
    if (status !== "ready") setSnapshot(null);
  }, [status]);

  if (status === "ready" && snapshot?.started) return null;

  const ready = status === "ready";
  const hasImage = snapshot?.has_image === true;

  async function setSeed(file: Blob, name: string) {
    setUploading(true);
    setSceneError("");
    try {
      const imageReady = new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          imageReadyRef.current = null;
          reject(new Error("Reactor did not accept the image in time. Try again."));
        }, IMAGE_ACCEPT_TIMEOUT_MS);
        imageReadyRef.current = () => {
          window.clearTimeout(timeout);
          resolve();
        };
      });
      const ref = await uploadFile(file, { name });
      await setImage({ image: ref });
      await imageReady;
    } catch (error) {
      setSceneError(error instanceof Error ? error.message : "Image setup failed.");
    } finally {
      imageReadyRef.current = null;
      setUploading(false);
    }
  }

  async function useStarter() {
    const response = await fetch("/seed/mirage-starter.jpeg");
    if (!response.ok) {
      setSceneError("Starter image could not be loaded.");
      return;
    }
    const blob = await response.blob();
    await setSeed(blob, "mirage-starter.jpeg");
  }

  async function startGame() {
    if (!ready || !hasImage || !prompt.trim()) return;
    if (!canGenerate) {
      onRequireBilling();
      return;
    }
    await setPrompt({ prompt: prompt.trim() });
    await start();
  }

  return (
    <section className="card">
      <label className="label">Seed world</label>
      <div className="button-grid">
        <button
          className="secondary"
          disabled={!ready || uploading}
          onClick={useStarter}
        >
          Use Mirage starter
        </button>
        <label className={`file-button ${!ready || uploading ? "disabled" : ""}`}>
          Upload image
          <input
            type="file"
            accept="image/*"
            disabled={!ready || uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void setSeed(file, file.name);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>

      {sceneError ? <p className="error">{sceneError}</p> : null}

      <textarea
        value={prompt}
        disabled={!ready}
        onChange={(event) => setPromptText(event.target.value)}
        placeholder="Describe the game world."
      />

      <button
        className="primary wide"
        disabled={!ready || !hasImage || !prompt.trim() || uploading}
        onClick={startGame}
      >
        {uploading
          ? "Preparing image..."
          : hasImage
            ? "Start game"
            : "Choose a seed image"}
      </button>
    </section>
  );
}

function NowPlaying() {
  const { status, pause, resume, reset } = useLingbot();
  const [snapshot, setSnapshot] = useState<LingbotStateMessage | null>(null);

  useLingbotState((msg) => setSnapshot(msg));

  useEffect(() => {
    if (status !== "ready") setSnapshot(null);
  }, [status]);

  if (status !== "ready" || !snapshot?.started) return null;

  const currentPrompt =
    typeof snapshot.current_prompt === "string"
      ? snapshot.current_prompt
      : "Generating...";

  return (
    <section className="card compact">
      <label className="label">Now playing</label>
      <p>{currentPrompt}</p>
      <div className="meta">
        <span>chunk {snapshot.current_chunk}</span>
        <span>{snapshot.current_action || "idle"}</span>
      </div>
      <div className="button-grid">
        {snapshot.running ? (
          <button className="secondary" onClick={() => pause()}>
            Pause
          </button>
        ) : (
          <button className="primary" onClick={() => resume()}>
            Resume
          </button>
        )}
        <button className="secondary" onClick={() => reset()}>
          New world
        </button>
      </div>
    </section>
  );
}

function Controls() {
  const {
    status,
    setMovement,
    setLookHorizontal,
    setLookVertical,
    setRotationSpeedDeg,
  } = useLingbot();
  const [snapshot, setSnapshot] = useState<LingbotStateMessage | null>(null);
  const [movement, setMovementLocal] = useState<Movement>("idle");
  const [lookH, setLookHLocal] = useState<LookH>("idle");
  const [lookV, setLookVLocal] = useState<LookV>("idle");

  useLingbotState((msg) => setSnapshot(msg));

  useEffect(() => {
    if (status !== "ready") {
      setSnapshot(null);
      setMovementLocal("idle");
      setLookHLocal("idle");
      setLookVLocal("idle");
    }
  }, [status]);

  const playing = status === "ready" && snapshot?.started === true;

  const sendMovement = useCallback(
    (next: Movement) => {
      if (!playing) return;
      setMovementLocal(next);
      void setMovement({ movement: next });
    },
    [playing, setMovement],
  );

  const sendLookH = useCallback(
    (next: LookH) => {
      if (!playing) return;
      setLookHLocal(next);
      void setLookHorizontal({ look_horizontal: next });
    },
    [playing, setLookHorizontal],
  );

  const sendLookV = useCallback(
    (next: LookV) => {
      if (!playing) return;
      setLookVLocal(next);
      void setLookVertical({ look_vertical: next });
    },
    [playing, setLookVertical],
  );

  useEffect(() => {
    if (!playing) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "w") {
        event.preventDefault();
        sendMovement("forward");
      } else if (key === "s") {
        event.preventDefault();
        sendMovement("back");
      } else if (key === "a") {
        event.preventDefault();
        sendMovement("strafe_left");
      } else if (key === "d") {
        event.preventDefault();
        sendMovement("strafe_right");
      } else if (key === "arrowleft") {
        event.preventDefault();
        sendLookH("left");
      } else if (key === "arrowright") {
        event.preventDefault();
        sendLookH("right");
      } else if (key === "arrowup") {
        event.preventDefault();
        sendLookV("up");
      } else if (key === "arrowdown") {
        event.preventDefault();
        sendLookV("down");
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (["w", "a", "s", "d"].includes(key)) {
        event.preventDefault();
        sendMovement("idle");
      } else if (["arrowleft", "arrowright"].includes(key)) {
        event.preventDefault();
        sendLookH("idle");
      } else if (["arrowup", "arrowdown"].includes(key)) {
        event.preventDefault();
        sendLookV("idle");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [playing, sendMovement, sendLookH, sendLookV]);

  if (!playing || !snapshot) return null;

  return (
    <section className="card compact">
      <label className="label">Controls</label>
      <div className="pads">
        <div className="pad">
          <PadButton active={movement === "forward"}>W</PadButton>
          <PadButton active={movement === "strafe_left"}>A</PadButton>
          <PadButton active={movement === "back"}>S</PadButton>
          <PadButton active={movement === "strafe_right"}>D</PadButton>
        </div>
        <div className="pad">
          <PadButton active={lookV === "up"}>↑</PadButton>
          <PadButton active={lookH === "left"}>←</PadButton>
          <PadButton active={lookV === "down"}>↓</PadButton>
          <PadButton active={lookH === "right"}>→</PadButton>
        </div>
      </div>
      <label className="range">
        Turn speed
        <input
          type="range"
          min={0}
          max={30}
          step={0.5}
          value={snapshot.rotation_speed_deg}
          onChange={(event) =>
            setRotationSpeedDeg({
              rotation_speed_deg: Number(event.currentTarget.value),
            })
          }
        />
      </label>
    </section>
  );
}

function PadButton({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  return <span className={active ? "pad-button active" : "pad-button"}>{children}</span>;
}

function StatusLabel({ status }: { status: string }) {
  const label =
    status === "waiting"
      ? "waiting for GPU"
      : status === "ready"
        ? "connected"
        : status;

  return <span className={`status ${status}`}>{label}</span>;
}
