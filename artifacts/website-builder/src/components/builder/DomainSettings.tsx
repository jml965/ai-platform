import React, { useState } from "react";
import { Globe, Plus, Trash2, RefreshCw, CheckCircle, XCircle, Shield, Loader2, Copy, Check, AlertCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useListDomains, useAddDomain, useVerifyDomain, useRemoveDomain } from "@workspace/api-client-react";
import type { DomainResponse, DomainVerifyResponse } from "@workspace/api-client-react";

interface DomainSettingsProps {
  projectId: string;
}

export default function DomainSettings({ projectId }: DomainSettingsProps) {
  const { t, lang } = useI18n();
  const [newDomain, setNewDomain] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<DomainVerifyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: domainsData, isLoading } = useListDomains(projectId);
  const addDomainMut = useAddDomain();
  const verifyDomainMut = useVerifyDomain();
  const removeDomainMut = useRemoveDomain();

  const domains = domainsData?.data || [];

  const handleAdd = async () => {
    if (!newDomain.trim()) return;
    setError(null);
    try {
      await addDomainMut.mutateAsync({ projectId, domain: newDomain.trim() });
      setNewDomain("");
    } catch (err: any) {
      setError(err?.data?.error?.message || err?.message || t.domain_error);
    }
  };

  const handleVerify = async (domainId: string) => {
    setError(null);
    try {
      const result = await verifyDomainMut.mutateAsync({ projectId, domainId });
      setVerifyResult(result);
    } catch (err: any) {
      setError(err?.data?.error?.message || err?.message || t.domain_error);
    }
  };

  const handleRemove = async (domainId: string) => {
    if (!confirm(t.domain_confirm_remove)) return;
    setError(null);
    try {
      await removeDomainMut.mutateAsync({ projectId, domainId });
      if (verifyResult?.id === domainId) setVerifyResult(null);
    } catch (err: any) {
      setError(err?.data?.error?.message || err?.message || t.domain_error);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "text-emerald-400 bg-emerald-400/10";
      case "dns_pending": return "text-amber-400 bg-amber-400/10";
      case "ssl_error": return "text-red-400 bg-red-400/10";
      default: return "text-[#8b949e] bg-[#8b949e]/10";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "active": return t.domain_status_active;
      case "dns_pending": return t.domain_status_dns_pending;
      case "ssl_error": return t.domain_status_ssl_error;
      default: return t.domain_status_pending;
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2 mb-3">
        <Globe className="w-4 h-4 text-[#58a6ff]" />
        <h3 className="text-sm font-semibold text-[#e1e4e8]">{t.domain_settings}</h3>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={newDomain}
          onChange={(e) => setNewDomain(e.target.value)}
          placeholder={t.domain_add_placeholder}
          className="flex-1 bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e1e4e8] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/50"
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          dir="ltr"
        />
        <button
          onClick={handleAdd}
          disabled={addDomainMut.isPending || !newDomain.trim()}
          className="px-3 py-2 bg-[#1f6feb] text-white text-sm rounded-lg hover:bg-[#388bfd] disabled:opacity-40 transition-colors flex items-center gap-1.5"
        >
          {addDomainMut.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Plus className="w-3.5 h-3.5" />
          )}
          {addDomainMut.isPending ? t.domain_adding : t.domain_add}
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-[#8b949e]" />
        </div>
      )}

      {!isLoading && domains.length === 0 && (
        <div className="text-center py-8 text-[#8b949e] text-sm">
          {t.domain_no_domains}
        </div>
      )}

      <div className="space-y-3">
        {domains.map((domain: DomainResponse) => (
          <div key={domain.id} className="bg-[#161b22] border border-[#1c2333] rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#8b949e]" />
                <span className="text-sm font-medium text-[#e1e4e8]" dir="ltr">{domain.domain}</span>
                <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium", getStatusColor(domain.status))}>
                  {getStatusLabel(domain.status)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleVerify(domain.id)}
                  disabled={verifyDomainMut.isPending}
                  className="p-1.5 text-[#8b949e] hover:text-[#58a6ff] hover:bg-[#1c2333] rounded transition-colors"
                  title={t.domain_verify}
                >
                  {verifyDomainMut.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  onClick={() => handleRemove(domain.id)}
                  disabled={removeDomainMut.isPending}
                  className="p-1.5 text-[#8b949e] hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                  title={t.domain_remove}
                >
                  {removeDomainMut.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-4 text-[11px]">
              <span className={cn("flex items-center gap-1", domain.dnsVerified ? "text-emerald-400" : "text-amber-400")}>
                {domain.dnsVerified ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {domain.dnsVerified ? t.domain_dns_verified : t.domain_dns_not_verified}
              </span>
              <span className={cn("flex items-center gap-1", domain.sslIssued ? "text-emerald-400" : "text-[#8b949e]")}>
                <Shield className="w-3 h-3" />
                {domain.sslIssued ? t.domain_ssl_issued : t.domain_ssl_not_issued}
              </span>
              {domain.sslExpiresAt && (
                <span className="text-[#8b949e]">
                  {t.domain_ssl_expires}: {new Date(domain.sslExpiresAt).toLocaleDateString()}
                </span>
              )}
            </div>

            {verifyResult?.id === domain.id && verifyResult.dnsInstructions && (
              <div className="bg-[#0d1117] border border-[#1c2333] rounded-lg p-3 space-y-2">
                <h4 className="text-xs font-semibold text-[#e1e4e8] flex items-center gap-1.5">
                  <AlertCircle className="w-3 h-3 text-[#58a6ff]" />
                  {t.domain_dns_instructions}
                </h4>

                <div className="space-y-2">
                  <DnsRecordRow
                    label={t.domain_dns_a_record}
                    type={verifyResult.dnsInstructions.aRecord.type}
                    host={verifyResult.dnsInstructions.aRecord.host}
                    value={verifyResult.dnsInstructions.aRecord.value}
                    copiedField={copiedField}
                    onCopy={copyToClipboard}
                    t={t}
                  />
                  <DnsRecordRow
                    label={t.domain_dns_cname_record}
                    type={verifyResult.dnsInstructions.cnameRecord.type}
                    host={verifyResult.dnsInstructions.cnameRecord.host}
                    value={verifyResult.dnsInstructions.cnameRecord.value}
                    copiedField={copiedField}
                    onCopy={copyToClipboard}
                    t={t}
                  />
                  <DnsRecordRow
                    label={t.domain_dns_txt_record}
                    type={verifyResult.dnsInstructions.txtRecord.type}
                    host={verifyResult.dnsInstructions.txtRecord.host}
                    value={verifyResult.dnsInstructions.txtRecord.value}
                    copiedField={copiedField}
                    onCopy={copyToClipboard}
                    t={t}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DnsRecordRow({
  label,
  type,
  host,
  value,
  copiedField,
  onCopy,
  t,
}: {
  label: string;
  type: string;
  host: string;
  value: string;
  copiedField: string | null;
  onCopy: (text: string, field: string) => void;
  t: any;
}) {
  const fieldKey = `${type}-${host}`;
  return (
    <div className="space-y-1">
      <p className="text-[11px] text-[#8b949e]">{label}</p>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div className="bg-[#161b22] rounded px-2 py-1.5">
          <span className="text-[#484f58] block">{t.domain_record_type}</span>
          <span className="text-[#e1e4e8] font-mono">{type}</span>
        </div>
        <div className="bg-[#161b22] rounded px-2 py-1.5">
          <span className="text-[#484f58] block">{t.domain_record_host}</span>
          <span className="text-[#e1e4e8] font-mono">{host}</span>
        </div>
        <div className="bg-[#161b22] rounded px-2 py-1.5 flex items-center justify-between gap-1">
          <div className="min-w-0">
            <span className="text-[#484f58] block">{t.domain_record_value}</span>
            <span className="text-[#e1e4e8] font-mono truncate block">{value}</span>
          </div>
          <button
            onClick={() => onCopy(value, fieldKey)}
            className="p-1 text-[#8b949e] hover:text-[#e1e4e8] transition-colors flex-shrink-0"
          >
            {copiedField === fieldKey ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          </button>
        </div>
      </div>
    </div>
  );
}
