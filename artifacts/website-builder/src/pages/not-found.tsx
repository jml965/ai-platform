import { AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { useI18n } from "@/lib/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";

export default function NotFound() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen w-full flex flex-col bg-background text-foreground">
      <header className="h-14 border-b border-white/10 bg-card/80 backdrop-blur flex items-center justify-end px-4">
        <LanguageToggle />
      </header>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">404 — {t.not_found_title}</h1>
          <p className="text-muted-foreground mb-6">{t.not_found_desc}</p>
          <Link href="/dashboard" className="text-primary hover:underline">
            {t.back}
          </Link>
        </div>
      </div>
    </div>
  );
}
