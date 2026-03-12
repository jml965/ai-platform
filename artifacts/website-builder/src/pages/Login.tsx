import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Sparkles, Terminal, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

type AuthProvider = "replit" | "local";

export default function Login() {
  const { t, lang } = useI18n();
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState<AuthProvider | null>(null);
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}api/auth/provider`)
      .then((r) => r.json())
      .then((data) => setProvider(data.provider))
      .catch(() => setProvider("replit"));
  }, []);

  const handleReplitLogin = () => {
    window.location.href = `${import.meta.env.BASE_URL}api/auth/login?returnTo=${encodeURIComponent(import.meta.env.BASE_URL)}`;
  };

  const handleLocalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError(t.password_min);
      return;
    }

    setLoading(true);
    try {
      const endpoint = isRegister ? "register" : "login";
      const body: Record<string, string> = { email, password };
      if (isRegister && displayName) body.displayName = displayName;

      const res = await fetch(`${import.meta.env.BASE_URL}api/auth/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || (isRegister ? t.register_error : t.login_error));
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["getMe"] });
      window.location.reload();
    } catch {
      setError(isRegister ? t.register_error : t.login_error);
    } finally {
      setLoading(false);
    }
  };

  if (provider === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-background">
      <div className="absolute inset-0 z-0">
        <img
          src={`${import.meta.env.BASE_URL}images/auth-bg.png`}
          alt="Abstract Background"
          className="w-full h-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
      </div>

      <div className="absolute top-6 end-6 z-20">
        <LanguageToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md p-8 glass-panel rounded-3xl text-center"
      >
        <div className="w-16 h-16 bg-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-primary/20">
          <Terminal className="w-8 h-8 text-primary" />
        </div>

        <h1 className="text-3xl font-bold text-foreground mb-3">
          {t.login_title}
        </h1>
        <p className="text-muted-foreground mb-8 text-sm leading-relaxed">
          {t.login_subtitle}
        </p>

        {provider === "replit" ? (
          <button
            onClick={handleReplitLogin}
            className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary text-primary-foreground py-3.5 px-6 rounded-xl font-semibold shadow-xl shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
          >
            <Sparkles className="w-5 h-5" />
            <span>{t.sign_in}</span>
          </button>
        ) : (
          <form onSubmit={handleLocalSubmit} className="space-y-4 text-start">
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}

            {isRegister && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  {t.display_name}
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-muted/50 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder={t.display_name}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                {t.email}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-xl bg-muted/50 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder={t.email}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                {t.password}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-4 py-2.5 rounded-xl bg-muted/50 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder={t.password}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary text-primary-foreground py-3.5 px-6 rounded-xl font-semibold shadow-xl shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Sparkles className="w-5 h-5" />
              )}
              <span>{isRegister ? t.sign_up : t.sign_in_local}</span>
            </button>

            <p className="text-center text-sm text-muted-foreground">
              {isRegister ? t.have_account : t.no_account}{" "}
              <button
                type="button"
                onClick={() => { setIsRegister(!isRegister); setError(""); }}
                className="text-primary hover:underline font-medium"
              >
                {isRegister ? t.sign_in_local : t.sign_up}
              </button>
            </p>
          </form>
        )}
      </motion.div>
    </div>
  );
}
