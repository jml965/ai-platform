import React, { useState, useEffect } from "react";
import { Smartphone, Loader2, Check, Wifi, WifiOff, Globe, Copy } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useGetPwaSettings, useUpdatePwaSettings } from "@workspace/api-client-react";

interface PwaSettingsPanelProps {
  projectId: string;
}

export default function PwaSettingsPanel({ projectId }: PwaSettingsPanelProps) {
  const { t } = useI18n();
  const { data: pwaSettings, refetch } = useGetPwaSettings(projectId, {
    query: {
      queryKey: ["getPwaSettings", projectId],
      enabled: !!projectId,
    },
  });

  const updateMut = useUpdatePwaSettings();

  const [form, setForm] = useState({
    enabled: false,
    appName: "My App",
    shortName: "App",
    description: "",
    themeColor: "#1f6feb",
    backgroundColor: "#ffffff",
    display: "standalone" as string,
    orientation: "any" as string,
    iconUrl: "",
    startUrl: "/",
    offlineEnabled: true,
  });

  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (pwaSettings) {
      setForm({
        enabled: pwaSettings.enabled,
        appName: pwaSettings.appName,
        shortName: pwaSettings.shortName,
        description: pwaSettings.description || "",
        themeColor: pwaSettings.themeColor,
        backgroundColor: pwaSettings.backgroundColor,
        display: pwaSettings.display,
        orientation: pwaSettings.orientation,
        iconUrl: pwaSettings.iconUrl || "",
        startUrl: pwaSettings.startUrl,
        offlineEnabled: pwaSettings.offlineEnabled,
      });
    }
  }, [pwaSettings]);

  const handleSave = async (overrides?: Partial<typeof form>) => {
    const data = { ...form, ...overrides };
    try {
      await updateMut.mutateAsync({
        projectId,
        data: {
          ...data,
          description: data.description || null,
          iconUrl: data.iconUrl || null,
        } as Parameters<typeof updateMut.mutateAsync>[0]["data"],
      });
      refetch();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save PWA settings:", err);
    }
  };

  const handleToggleEnabled = () => {
    const newEnabled = !form.enabled;
    setForm(f => ({ ...f, enabled: newEnabled }));
    handleSave({ enabled: newEnabled });
  };

  const manifestUrl = `/api/projects/${projectId}/pwa/manifest`;
  const swUrl = `/api/projects/${projectId}/pwa/service-worker`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(window.location.origin + text);
  };

  return (
    <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(100vh-200px)]">
      <div className="flex items-center gap-2 mb-4">
        <Smartphone className="w-5 h-5 text-[#58a6ff]" />
        <h3 className="text-sm font-semibold text-[#e1e4e8]">{t.pwa_title}</h3>
        {form.enabled && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">
            {t.pwa_enabled_badge}
          </span>
        )}
      </div>

      <label className="flex items-center justify-between p-3 bg-[#161b22] border border-[#30363d] rounded-lg cursor-pointer hover:border-[#58a6ff]/50 transition-colors">
        <div className="flex-1">
          <p className="text-[13px] font-medium text-[#e1e4e8]">{t.pwa_enable}</p>
          <p className="text-[11px] text-[#b0bac5] mt-0.5">{t.pwa_enable_desc}</p>
        </div>
        <div
          onClick={handleToggleEnabled}
          className={cn(
            "w-10 h-5 rounded-full relative transition-colors cursor-pointer flex-shrink-0 ms-3",
            form.enabled ? "bg-[#1f6feb]" : "bg-[#30363d]"
          )}
        >
          <div
            className={cn(
              "w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all",
              form.enabled ? "end-0.5" : "start-0.5"
            )}
          />
        </div>
      </label>

      {form.enabled && (
        <>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-medium text-[#b0bac5] mb-1 block">{t.pwa_app_name}</label>
              <input
                type="text"
                value={form.appName}
                onChange={e => setForm(f => ({ ...f, appName: e.target.value }))}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-1.5 text-[13px] text-[#e1e4e8] focus:outline-none focus:border-[#58a6ff] transition-colors"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-[#b0bac5] mb-1 block">{t.pwa_short_name}</label>
              <input
                type="text"
                value={form.shortName}
                onChange={e => setForm(f => ({ ...f, shortName: e.target.value }))}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-1.5 text-[13px] text-[#e1e4e8] focus:outline-none focus:border-[#58a6ff] transition-colors"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-[#b0bac5] mb-1 block">{t.pwa_description}</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-1.5 text-[13px] text-[#e1e4e8] focus:outline-none focus:border-[#58a6ff] transition-colors resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-[#b0bac5] mb-1 block">{t.pwa_theme_color}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.themeColor}
                    onChange={e => setForm(f => ({ ...f, themeColor: e.target.value }))}
                    className="w-8 h-8 rounded border border-[#30363d] bg-transparent cursor-pointer"
                  />
                  <input
                    type="text"
                    value={form.themeColor}
                    onChange={e => setForm(f => ({ ...f, themeColor: e.target.value }))}
                    className="flex-1 bg-[#0d1117] border border-[#30363d] rounded-md px-2 py-1.5 text-[12px] text-[#e1e4e8] font-mono focus:outline-none focus:border-[#58a6ff] transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-medium text-[#b0bac5] mb-1 block">{t.pwa_bg_color}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.backgroundColor}
                    onChange={e => setForm(f => ({ ...f, backgroundColor: e.target.value }))}
                    className="w-8 h-8 rounded border border-[#30363d] bg-transparent cursor-pointer"
                  />
                  <input
                    type="text"
                    value={form.backgroundColor}
                    onChange={e => setForm(f => ({ ...f, backgroundColor: e.target.value }))}
                    className="flex-1 bg-[#0d1117] border border-[#30363d] rounded-md px-2 py-1.5 text-[12px] text-[#e1e4e8] font-mono focus:outline-none focus:border-[#58a6ff] transition-colors"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-[#b0bac5] mb-1 block">{t.pwa_display}</label>
                <select
                  value={form.display}
                  onChange={e => setForm(f => ({ ...f, display: e.target.value }))}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-1.5 text-[13px] text-[#e1e4e8] focus:outline-none focus:border-[#58a6ff] transition-colors"
                >
                  <option value="standalone">{t.pwa_display_standalone}</option>
                  <option value="fullscreen">{t.pwa_display_fullscreen}</option>
                  <option value="minimal-ui">{t.pwa_display_minimal}</option>
                  <option value="browser">{t.pwa_display_browser}</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-[#b0bac5] mb-1 block">{t.pwa_orientation}</label>
                <select
                  value={form.orientation}
                  onChange={e => setForm(f => ({ ...f, orientation: e.target.value }))}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-1.5 text-[13px] text-[#e1e4e8] focus:outline-none focus:border-[#58a6ff] transition-colors"
                >
                  <option value="any">{t.pwa_orientation_any}</option>
                  <option value="portrait">{t.pwa_orientation_portrait}</option>
                  <option value="landscape">{t.pwa_orientation_landscape}</option>
                  <option value="natural">{t.pwa_orientation_natural}</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-[#b0bac5] mb-1 block">{t.pwa_icon_url}</label>
              <input
                type="text"
                value={form.iconUrl}
                onChange={e => setForm(f => ({ ...f, iconUrl: e.target.value }))}
                placeholder={t.pwa_icon_placeholder}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-1.5 text-[13px] text-[#e1e4e8] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] transition-colors"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-[#b0bac5] mb-1 block">{t.pwa_start_url}</label>
              <input
                type="text"
                value={form.startUrl}
                onChange={e => setForm(f => ({ ...f, startUrl: e.target.value }))}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-1.5 text-[13px] text-[#e1e4e8] font-mono focus:outline-none focus:border-[#58a6ff] transition-colors"
              />
            </div>

            <label className="flex items-center justify-between p-3 bg-[#161b22] border border-[#30363d] rounded-lg cursor-pointer hover:border-[#58a6ff]/50 transition-colors">
              <div className="flex items-center gap-2">
                {form.offlineEnabled ? (
                  <WifiOff className="w-4 h-4 text-[#58a6ff]" />
                ) : (
                  <Wifi className="w-4 h-4 text-[#b0bac5]" />
                )}
                <div>
                  <p className="text-[13px] font-medium text-[#e1e4e8]">{t.pwa_offline}</p>
                  <p className="text-[11px] text-[#b0bac5]">{t.pwa_offline_desc}</p>
                </div>
              </div>
              <div
                onClick={() => setForm(f => ({ ...f, offlineEnabled: !f.offlineEnabled }))}
                className={cn(
                  "w-10 h-5 rounded-full relative transition-colors cursor-pointer flex-shrink-0 ms-3",
                  form.offlineEnabled ? "bg-[#1f6feb]" : "bg-[#30363d]"
                )}
              >
                <div
                  className={cn(
                    "w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all",
                    form.offlineEnabled ? "end-0.5" : "start-0.5"
                  )}
                />
              </div>
            </label>
          </div>

          <div className="space-y-2 p-3 bg-[#161b22] border border-[#30363d] rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#b0bac5]">{t.pwa_manifest_url}</span>
              <button
                onClick={() => copyToClipboard(manifestUrl)}
                className="p-1 text-[#b0bac5] hover:text-[#e1e4e8] transition-colors"
              >
                <Copy className="w-3 h-3" />
              </button>
            </div>
            <p className="text-[11px] font-mono text-[#58a6ff] truncate">{manifestUrl}</p>

            <div className="flex items-center justify-between mt-2">
              <span className="text-[11px] text-[#b0bac5]">{t.pwa_sw_url}</span>
              <button
                onClick={() => copyToClipboard(swUrl)}
                className="p-1 text-[#b0bac5] hover:text-[#e1e4e8] transition-colors"
              >
                <Copy className="w-3 h-3" />
              </button>
            </div>
            <p className="text-[11px] font-mono text-[#58a6ff] truncate">{swUrl}</p>
          </div>

          <button
            onClick={() => handleSave()}
            disabled={updateMut.isPending}
            className={cn(
              "w-full flex items-center justify-center gap-2 px-4 py-2 text-[13px] font-medium rounded-lg transition-all",
              saved
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : "bg-[#1f6feb] text-white hover:bg-[#388bfd] disabled:opacity-50"
            )}
          >
            {updateMut.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t.pwa_saving}
              </>
            ) : saved ? (
              <>
                <Check className="w-4 h-4" />
                {t.pwa_saved}
              </>
            ) : (
              <>
                <Globe className="w-4 h-4" />
                {t.pwa_save}
              </>
            )}
          </button>
        </>
      )}
    </div>
  );
}
