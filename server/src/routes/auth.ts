import { Router, type Request } from "express";
import {
  register,
  login,
  loginWithGoogle,
  getAuthUser,
  verifyToken,
  googleEnabled,
  AuthError,
} from "../auth.js";
import { mergeAnonymous } from "../watchlist.js";

export const authRouter = Router();

export function bearerToken(req: Request): string | undefined {
  const h = req.header("authorization");
  return h?.startsWith("Bearer ") ? h.slice(7) : undefined;
}

authRouter.post("/register", async (req, res) => {
  try {
    const { email, password, name } = req.body ?? {};
    const { user, token } = await register(
      String(email ?? ""),
      String(password ?? ""),
      name ? String(name) : undefined
    );
    const clientId = req.header("x-client-id");
    if (clientId) await mergeAnonymous(clientId, user.id).catch(() => {});
    res.json({ token, user });
  } catch (e) {
    if (e instanceof AuthError) return res.status(400).json({ error: e.message });
    console.error("register error", e);
    res.status(500).json({ error: "Registration failed." });
  }
});

authRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    const { user, token } = await login(String(email ?? ""), String(password ?? ""));
    const clientId = req.header("x-client-id");
    if (clientId) await mergeAnonymous(clientId, user.id).catch(() => {});
    res.json({ token, user });
  } catch (e) {
    if (e instanceof AuthError) return res.status(401).json({ error: e.message });
    console.error("login error", e);
    res.status(500).json({ error: "Login failed." });
  }
});

// POST /api/auth/google { credential } — verify a Google ID token, sign in/up.
authRouter.post("/google", async (req, res) => {
  try {
    const { credential } = req.body ?? {};
    const { user, token } = await loginWithGoogle(String(credential ?? ""));
    const clientId = req.header("x-client-id");
    if (clientId) await mergeAnonymous(clientId, user.id).catch(() => {});
    res.json({ token, user });
  } catch (e) {
    if (e instanceof AuthError) return res.status(401).json({ error: e.message });
    console.error("google auth error", e);
    res.status(500).json({ error: "Google sign-in failed." });
  }
});

// GET /api/auth/config — which sign-in methods are available.
authRouter.get("/config", (_req, res) => {
  res.json({ google: googleEnabled() });
});

authRouter.get("/me", async (req, res) => {
  try {
    const userId = verifyToken(bearerToken(req));
    const user = userId ? await getAuthUser(userId) : null;
    if (!user) return res.status(401).json({ error: "Not signed in." });
    res.json({ user });
  } catch (e) {
    console.error("me error", e);
    res.status(500).json({ error: "Server error." });
  }
});
