import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { db } from "@workspace/db";
import { aiProvidersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

let cachedKeys: Record<string, string | null> & { fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

let _cachedAnthropicClient: Anthropic | null = null;
let _cachedOpenAIClient: OpenAI | null = null;
let _cachedGoogleClient: GoogleGenAI | null = null;
let _clientCacheTime = 0;

async function fetchActiveKey(providerKey: string): Promise<string | null> {
  try {
    const now = Date.now();
    if (cachedKeys && (now - cachedKeys.fetchedAt) < CACHE_TTL_MS) {
      return cachedKeys[providerKey] ?? null;
    }

    const rows = await db
      .select({
        providerKey: aiProvidersTable.providerKey,
        apiKey: aiProvidersTable.apiKey,
        enabled: aiProvidersTable.enabled,
      })
      .from(aiProvidersTable)
      .where(eq(aiProvidersTable.enabled, true));

    const newCache: any = { fetchedAt: now };
    for (const row of rows) {
      if (row.apiKey && row.apiKey.trim().length > 5 && row.enabled) {
        newCache[row.providerKey] = row.apiKey;
      }
    }
    cachedKeys = newCache;
    return newCache[providerKey] ?? null;
  } catch {
    return null;
  }
}

export function clearKeyCache() {
  cachedKeys = null;
  _cachedAnthropicClient = null;
  _cachedOpenAIClient = null;
  _cachedGoogleClient = null;
  _clientCacheTime = 0;
}

export async function getOpenAIClient(): Promise<OpenAI> {
  const now = Date.now();
  if (_cachedOpenAIClient && (now - _clientCacheTime) < CACHE_TTL_MS) return _cachedOpenAIClient;

  const dbKey = await fetchActiveKey("openai");
  if (dbKey) {
    _cachedOpenAIClient = new OpenAI({ apiKey: dbKey });
    _clientCacheTime = now;
    return _cachedOpenAIClient;
  }

  throw new Error("مفتاح OpenAI غير موجود. أضفه من مركز التحكم (Control Center).");
}

export async function getAnthropicClient(): Promise<Anthropic> {
  const now = Date.now();
  if (_cachedAnthropicClient && (now - _clientCacheTime) < CACHE_TTL_MS) return _cachedAnthropicClient;

  const dbKey = await fetchActiveKey("anthropic");
  if (dbKey) {
    _cachedAnthropicClient = new Anthropic({ apiKey: dbKey });
    _clientCacheTime = now;
    return _cachedAnthropicClient;
  }

  throw new Error("مفتاح Anthropic غير موجود. أضفه من مركز التحكم (Control Center).");
}

export async function getGoogleClient(): Promise<GoogleGenAI> {
  const now = Date.now();
  if (_cachedGoogleClient && (now - _clientCacheTime) < CACHE_TTL_MS) return _cachedGoogleClient;

  const dbKey = await fetchActiveKey("google");
  if (dbKey) {
    _cachedGoogleClient = new GoogleGenAI({ apiKey: dbKey });
    _clientCacheTime = now;
    return _cachedGoogleClient;
  }

  throw new Error("مفتاح Google غير موجود. أضفه من مركز التحكم (Control Center).");
}
