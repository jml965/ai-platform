import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

const API_BASE = import.meta.env.VITE_API_URL || "";

export interface DomainResponse {
  id: string;
  projectId: string;
  domain: string;
  status: string;
  dnsVerified: boolean;
  sslIssued: boolean;
  sslExpiresAt: string | null;
  verificationToken: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DnsInstructions {
  aRecord: { type: string; host: string; value: string };
  cnameRecord: { type: string; host: string; value: string };
  txtRecord: { type: string; host: string; value: string };
}

export interface DomainVerifyResponse extends DomainResponse {
  dnsRecords: { type: string; value: string }[];
  dnsInstructions: DnsInstructions;
}

export function useListDomains(projectId: string | undefined) {
  return useQuery<{ data: DomainResponse[] }>({
    queryKey: ["domains", projectId],
    queryFn: () =>
      customFetch(`${API_BASE}/projects/${projectId}/domains`, {
        credentials: "include",
      }),
    enabled: !!projectId,
  });
}

export function useAddDomain() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, domain }: { projectId: string; domain: string }) =>
      customFetch<DomainResponse>(`${API_BASE}/projects/${projectId}/domains`, {
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ domain }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["domains", variables.projectId] });
    },
  });
}

export function useVerifyDomain() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, domainId }: { projectId: string; domainId: string }) =>
      customFetch<DomainVerifyResponse>(`${API_BASE}/projects/${projectId}/domains/${domainId}/verify`, {
        method: "POST",
        credentials: "include",
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["domains", variables.projectId] });
    },
  });
}

export function useRemoveDomain() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, domainId }: { projectId: string; domainId: string }) =>
      customFetch(`${API_BASE}/projects/${projectId}/domains/${domainId}`, {
        method: "DELETE",
        credentials: "include",
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["domains", variables.projectId] });
    },
  });
}
