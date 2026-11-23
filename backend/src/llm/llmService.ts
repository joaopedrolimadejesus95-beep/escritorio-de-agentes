import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs/promises';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import {
  decryptSecret,
  encryptSecret,
  ensureMasterEncryptionKey,
  ENV_LOCAL_PATH,
  globalRateLimiter,
  sanitizeSensitiveText,
} from '../security/security.js';

export type LLMProviderType = 'gemini' | 'anthropic' | 'openai' | 'ollama';
export type LLMKeyStorageMode =
  | 'encrypted_db'
  | 'session_memory'
  | 'local_env'
  | 'ollama_auto';

export interface LLMRuntimeConfig {
  provider: LLMProviderType;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface LLMStatusDTO {
  configured: boolean;
  provider: LLMProviderType | null;
  model: string | null;
  maskedKey: string | null;
  storageMode: LLMKeyStorageMode | null;
  ollamaAvailable: boolean;
}

export class LLMNotConfiguredError extends Error {
  public readonly code = 'LLM_NOT_CONFIGURED';
  constructor(
    message = 'Configure sua própria chave de IA (Gemini, Anthropic, OpenAI ou Ollama local) em "Configurar IA" para executar projetos na sua conta.'
  ) {
    super(message);
    this.name = 'LLMNotConfiguredError';
  }
}

const SESSION_KEY_TTL_MS = 12 * 60 * 60 * 1000;
const llmUserContext = new AsyncLocalStorage<string | null>();
const sessionMemoryKeys = new Map<
  string,
  { config: LLMRuntimeConfig; expiresAt: number }
>();

export function runWithLLMUserContext<T>(
  userId: string | null | undefined,
  fn: () => Promise<T>
): Promise<T> {
  return llmUserContext.run(userId ?? null, fn);
}

/**
 * Carrega variáveis de `backend/.env.local` (ignorado pelo git) no startup, se existir,
 * e garante inicialização da chave mestra AES-256-GCM.
 */
export async function loadLocalEnvFile(): Promise<void> {
  try {
    const content = await fs.readFile(ENV_LOCAL_PATH, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx <= 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key && val && !process.env[key]) {
        process.env[key] = val;
      }
    }
  } catch {
    // Arquivo .env.local opcional ainda não existe
  }

  await ensureMasterEncryptionKey();
}

function maskApiKey(key?: string | null): string | null {
  if (!key || key.length < 8) return null;
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

async function checkOllamaHealth(
  baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(800),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Salva configuração de IA isolada para um usuário específico.
 * - `persistInDb = true`: criptografa a API key com AES-256-GCM + AAD (`userId:provider`).
 * - `persistInDb = false`: mantém apenas na memória RAM efêmera da sessão (zero persistência).
 */
export async function saveUserLLMConfig(params: {
  userId: string;
  config: LLMRuntimeConfig;
  persistInDb: boolean;
}): Promise<LLMStatusDTO> {
  const cleanConfig: LLMRuntimeConfig = {
    provider: params.config.provider,
    model: params.config.model.trim(),
    apiKey: params.config.apiKey?.trim(),
    baseUrl: params.config.baseUrl?.trim(),
  };

  if (!params.persistInDb) {
    sessionMemoryKeys.set(params.userId, {
      config: cleanConfig,
      expiresAt: Date.now() + SESSION_KEY_TTL_MS,
    });
    await pool.query(`DELETE FROM user_llm_configs WHERE user_id = $1`, [
      params.userId,
    ]);
    return await getLLMStatus(params.userId);
  }

  sessionMemoryKeys.delete(params.userId);

  let ciphertext: string | null = null;
  let iv: string | null = null;
  let tag: string | null = null;
  let keyMask: string | null = null;

  if (cleanConfig.provider !== 'ollama' && cleanConfig.apiKey) {
    const enc = await encryptSecret(
      cleanConfig.apiKey,
      `${params.userId}:${cleanConfig.provider}`
    );
    ciphertext = enc.ciphertext;
    iv = enc.iv;
    tag = enc.tag;
    keyMask = maskApiKey(cleanConfig.apiKey);
  }

  await pool.query(
    `INSERT INTO user_llm_configs (
       user_id, provider, model, base_url, api_key_ciphertext, api_key_iv, api_key_tag, key_mask, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       provider = EXCLUDED.provider,
       model = EXCLUDED.model,
       base_url = EXCLUDED.base_url,
       api_key_ciphertext = EXCLUDED.api_key_ciphertext,
       api_key_iv = EXCLUDED.api_key_iv,
       api_key_tag = EXCLUDED.api_key_tag,
       key_mask = EXCLUDED.key_mask,
       updated_at = NOW()`,
    [
      params.userId,
      cleanConfig.provider,
      cleanConfig.model,
      cleanConfig.baseUrl ?? null,
      ciphertext,
      iv,
      tag,
      keyMask,
    ]
  );

  return await getLLMStatus(params.userId);
}

export async function deleteUserLLMConfig(userId: string): Promise<LLMStatusDTO> {
  sessionMemoryKeys.delete(userId);
  await pool.query(`DELETE FROM user_llm_configs WHERE user_id = $1`, [userId]);
  return await getLLMStatus(userId);
}

function getSessionMemoryConfig(userId: string): LLMRuntimeConfig | null {
  const entry = sessionMemoryKeys.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    sessionMemoryKeys.delete(userId);
    return null;
  }
  return entry.config;
}

async function resolveUserStoredConfig(userId: string): Promise<{
  config: LLMRuntimeConfig;
  storageMode: LLMKeyStorageMode;
  maskedKey: string | null;
} | null> {
  const mem = getSessionMemoryConfig(userId);
  if (mem) {
    return {
      config: mem,
      storageMode: 'session_memory',
      maskedKey: maskApiKey(mem.apiKey),
    };
  }

  const res = await pool.query(
    `SELECT provider, model, base_url, api_key_ciphertext, api_key_iv, api_key_tag, key_mask
     FROM user_llm_configs
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );

  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  const provider = String(row.provider) as LLMProviderType;
  let apiKey: string | undefined;

  if (
    provider !== 'ollama' &&
    row.api_key_ciphertext &&
    row.api_key_iv &&
    row.api_key_tag
  ) {
    apiKey = await decryptSecret(
      {
        ciphertext: String(row.api_key_ciphertext),
        iv: String(row.api_key_iv),
        tag: String(row.api_key_tag),
      },
      `${userId}:${provider}`
    );
  }

  return {
    config: {
      provider,
      model: String(row.model),
      apiKey,
      baseUrl: row.base_url ? String(row.base_url) : undefined,
    },
    storageMode: 'encrypted_db',
    maskedKey: row.key_mask ? String(row.key_mask) : maskApiKey(apiKey),
  };
}

function resolveEnvFallbackConfig(): LLMRuntimeConfig | null {
  const preferred = process.env.LLM_PROVIDER as LLMProviderType | undefined;
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const ollamaModel = process.env.OLLAMA_MODEL?.trim();

  if (preferred === 'anthropic' && anthropicKey) {
    return {
      provider: 'anthropic',
      model: process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-5',
      apiKey: anthropicKey,
    };
  }
  if (preferred === 'openai' && openaiKey) {
    return {
      provider: 'openai',
      model: process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini',
      apiKey: openaiKey,
    };
  }
  if (preferred === 'ollama' && ollamaModel) {
    return {
      provider: 'ollama',
      model: ollamaModel,
      baseUrl: process.env.OLLAMA_BASE_URL?.trim() || 'http://localhost:11434',
    };
  }
  if (geminiKey) {
    const rawModel = process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash';
    return {
      provider: 'gemini',
      model: rawModel === 'gemini-2.5-flash' ? 'gemini-3.8-flash' : rawModel,
      apiKey: geminiKey,
    };
  }
  if (anthropicKey) {
    return {
      provider: 'anthropic',
      model: process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-5',
      apiKey: anthropicKey,
    };
  }
  if (openaiKey) {
    return {
      provider: 'openai',
      model: process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini',
      apiKey: openaiKey,
    };
  }
  if (ollamaModel) {
    return {
      provider: 'ollama',
      model: ollamaModel,
      baseUrl: process.env.OLLAMA_BASE_URL?.trim() || 'http://localhost:11434',
    };
  }

  return null;
}

export async function getLLMStatus(userId?: string | null): Promise<LLMStatusDTO> {
  const ollamaAvailable = await checkOllamaHealth();

  if (userId) {
    const stored = await resolveUserStoredConfig(userId);
    if (stored) {
      return {
        configured: Boolean(
          stored.config.provider === 'ollama' || stored.config.apiKey
        ),
        provider: stored.config.provider,
        model: stored.config.model,
        maskedKey: stored.maskedKey,
        storageMode: stored.storageMode,
        ollamaAvailable,
      };
    }

    // Usuários autenticados nunca herdam chaves de .env.local do dono do servidor
    return {
      configured: false,
      provider: null,
      model: null,
      maskedKey: null,
      storageMode: null,
      ollamaAvailable,
    };
  }

  // Sem sessão ativa (status anônimo): nunca expõe máscara nem chave global de .env.local
  return {
    configured: false,
    provider: null,
    model: null,
    maskedKey: null,
    storageMode: null,
    ollamaAvailable,
  };
}

export interface LLMJsonCallParams {
  systemInstruction: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMJsonCallResult<T> {
  data: T;
  tokensUsed: number;
  providerUsed: LLMProviderType;
  modelUsed: string;
}

function extractJsonFromText(rawText: string): unknown {
  const trimmed = rawText.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenceMatch?.[1]?.trim() || trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
    }
    throw new Error('Resposta da LLM não contém JSON válido.');
  }
}

const GEMINI_FALLBACK_CHAIN = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-flash-latest',
];

async function invokeProviderRaw(
  config: LLMRuntimeConfig,
  params: LLMJsonCallParams
): Promise<{ rawText: string; tokensUsed: number }> {
  if (config.provider === 'gemini') {
    if (!config.apiKey) throw new LLMNotConfiguredError();
    const preferredModel =
      config.model === 'gemini-2.5-flash' ? 'gemini-3.8-flash' : config.model;

    const modelCandidates = Array.from(
      new Set([preferredModel, ...GEMINI_FALLBACK_CHAIN])
    );

    const ai = new GoogleGenAI({
      apiKey: config.apiKey,
      apiVersion: 'v1beta',
      httpOptions: { timeout: 90000 },
    });

    let lastError: unknown = null;

    for (const candidateModel of modelCandidates) {
      try {
        const res = await ai.models.generateContent({
          model: candidateModel,
          contents: params.userPrompt,
          config: {
            systemInstruction: params.systemInstruction,
            responseMimeType: 'application/json',
            temperature: params.temperature ?? 0.25,
            maxOutputTokens: params.maxTokens ?? 8192,
          },
        });

        const rawText = res.text?.trim() ?? '';
        if (!rawText) {
          throw new Error(`Gemini (${candidateModel}) retornou resposta vazia.`);
        }

        const totalTokens =
          res.usageMetadata?.totalTokenCount ??
          ((res.usageMetadata?.promptTokenCount ?? 0) +
            (res.usageMetadata?.candidatesTokenCount ?? 0) ||
            1800);

        if (candidateModel !== preferredModel) {
          console.log(
            `[LLM Service] Fallback bem-sucedido: ${preferredModel} -> ${candidateModel}`
          );
        }

        return {
          rawText,
          tokensUsed: totalTokens,
        };
      } catch (err) {
        lastError = err;
        const msg = sanitizeSensitiveText(
          err instanceof Error ? err.message : String(err)
        );
        const isTransientOrUnavailable =
          /\b(503|504|429|404|UNAVAILABLE|DEADLINE_EXCEEDED|RESOURCE_EXHAUSTED|high demand|not found|timed? out|ETIMEDOUT)\b/i.test(
            msg
          );
        if (!isTransientOrUnavailable) {
          throw new Error(msg);
        }
        console.warn(
          `[LLM Service] Modelo ${candidateModel} indisponível/sobrecarregado (${msg.slice(0, 90)}). Tentando próximo fallback...`
        );
      }
    }

    const finalMsg = sanitizeSensitiveText(
      lastError instanceof Error ? lastError.message : String(lastError)
    );
    throw new Error(finalMsg);
  }

  if (config.provider === 'anthropic') {
    if (!config.apiKey) throw new LLMNotConfiguredError();
    const base = config.baseUrl || 'https://api.anthropic.com/v1';

    const controller = new AbortController();
    const totalTimer = setTimeout(() => controller.abort(), 240_000);
    let idleTimer = setTimeout(() => controller.abort(), 60_000);
    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => controller.abort(), 60_000);
    };

    try {
      const res = await fetch(`${base}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: params.maxTokens ?? 4096,
          temperature: params.temperature ?? 0.25,
          stream: true,
          system: `${params.systemInstruction}\n\nRetorne EXCLUSIVAMENTE um objeto JSON válido, sem markdown ou texto adicional.`,
          messages: [{ role: 'user', content: params.userPrompt }],
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = sanitizeSensitiveText(await res.text());
        throw new Error(
          `Anthropic API HTTP ${res.status}: ${errBody.slice(0, 300)}`
        );
      }

      if (!res.body) {
        throw new Error('Anthropic API não retornou stream de resposta.');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';
      const textChunks: string[] = [];
      let inputTokens = 0;
      let outputTokens = 0;

      while (true) {
        const { value, done } = await reader.read();
        resetIdleTimer();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split(/\r?\n/);
        sseBuffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine.startsWith('data:')) continue;
          const payloadStr = trimmedLine.slice(5).trim();
          if (!payloadStr || payloadStr === '[DONE]') continue;

          try {
            const evt = JSON.parse(payloadStr) as {
              type?: string;
              message?: { usage?: { input_tokens?: number } };
              delta?: { type?: string; text?: string };
              usage?: { output_tokens?: number };
              error?: { message?: string };
            };

            if (evt.type === 'error') {
              throw new Error(
                evt.error?.message || 'Erro interno no stream da Anthropic.'
              );
            }
            if (evt.type === 'message_start') {
              inputTokens = evt.message?.usage?.input_tokens ?? inputTokens;
            } else if (
              evt.type === 'content_block_delta' &&
              evt.delta?.type === 'text_delta' &&
              typeof evt.delta.text === 'string'
            ) {
              textChunks.push(evt.delta.text);
            } else if (evt.type === 'message_delta' && evt.usage) {
              outputTokens = evt.usage.output_tokens ?? outputTokens;
            }
          } catch (parseErr) {
            if (
              parseErr instanceof Error &&
              !parseErr.message.includes('JSON')
            ) {
              throw parseErr;
            }
          }
        }
      }

      const rawText = textChunks.join('').trim();
      if (!rawText) {
        throw new Error('Anthropic API retornou resposta vazia.');
      }

      return {
        rawText,
        tokensUsed: inputTokens + outputTokens || 1800,
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(
          'Timeout na comunicação com a Anthropic API (o stream demorou mais que o limite).'
        );
      }
      throw err;
    } finally {
      clearTimeout(totalTimer);
      clearTimeout(idleTimer);
    }
  }

  if (config.provider === 'openai') {
    if (!config.apiKey) throw new LLMNotConfiguredError();
    const base = config.baseUrl || 'https://api.openai.com/v1';
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: params.temperature ?? 0.25,
        max_tokens: params.maxTokens ?? 4096,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: params.systemInstruction },
          { role: 'user', content: params.userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      const errBody = sanitizeSensitiveText(await res.text());
      throw new Error(`OpenAI API HTTP ${res.status}: ${errBody.slice(0, 300)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
    };

    const rawText = json.choices?.[0]?.message?.content ?? '';
    if (!rawText) {
      throw new Error('OpenAI API retornou resposta vazia.');
    }

    return {
      rawText,
      tokensUsed: json.usage?.total_tokens ?? 1800,
    };
  }

  // Ollama local
  const ollamaUrl = config.baseUrl || 'http://localhost:11434';
  const res = await fetch(`${ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      format: 'json',
      stream: false,
      options: {
        temperature: params.temperature ?? 0.25,
      },
      messages: [
        { role: 'system', content: params.systemInstruction },
        { role: 'user', content: params.userPrompt },
      ],
    }),
    signal: AbortSignal.timeout(90000),
  });

  if (!res.ok) {
    const errBody = sanitizeSensitiveText(await res.text());
    throw new Error(`Ollama API HTTP ${res.status}: ${errBody.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    message?: { content?: string };
    prompt_eval_count?: number;
    eval_count?: number;
  };
  const rawText = json.message?.content ?? '';
  if (!rawText) {
    throw new Error('Ollama retornou resposta vazia.');
  }

  return {
    rawText,
    tokensUsed: (json.prompt_eval_count ?? 800) + (json.eval_count ?? 1200),
  };
}

/**
 * Executa chamada real ao provedor LLM do usuário atual (com rate-limit por usuário e auto-reparo Zod).
 */
export async function generateValidatedJson<TSchema extends z.ZodTypeAny>(params: {
  systemInstruction: string;
  userPrompt: string;
  schema: TSchema;
  temperature?: number;
  maxTokens?: number;
  extraValidator?: (data: z.infer<TSchema>) => string[];
}): Promise<LLMJsonCallResult<z.infer<TSchema>>> {
  const activeUserId = llmUserContext.getStore() ?? null;
  let config: LLMRuntimeConfig | null = null;

  if (activeUserId) {
    const stored = await resolveUserStoredConfig(activeUserId);
    config = stored?.config ?? null;
    if (!config) {
      throw new LLMNotConfiguredError();
    }
  } else {
    config = resolveEnvFallbackConfig();
    if (!config) {
      const hasOllama = await checkOllamaHealth();
      if (hasOllama) {
        config = {
          provider: 'ollama',
          model: process.env.OLLAMA_MODEL?.trim() || 'llama3.1',
          baseUrl: process.env.OLLAMA_BASE_URL?.trim() || 'http://localhost:11434',
        };
      }
    }
  }

  if (!config) {
    throw new LLMNotConfiguredError();
  }

  // Proteção contra abuso / loops infinitos: teto de 60 chamadas LLM/minuto por usuário
  const llmRate = globalRateLimiter.check(
    `llm_calls:${activeUserId ?? 'local'}`,
    60,
    60_000
  );
  if (!llmRate.allowed) {
    throw new Error(
      `Limite de requisições LLM atingido. Aguarde ${llmRate.retryAfterSec}s antes de executar novamente.`
    );
  }

  let totalTokens = 0;
  let currentPrompt = params.userPrompt;
  let lastErrorSummary = '';

  for (let attempt = 1; attempt <= 3; attempt++) {
    const { rawText, tokensUsed } = await invokeProviderRaw(config, {
      systemInstruction: params.systemInstruction,
      userPrompt: currentPrompt,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
    });
    totalTokens += tokensUsed;

    try {
      const parsedJson = extractJsonFromText(rawText);
      const zodResult = params.schema.safeParse(parsedJson);

      if (!zodResult.success) {
        const issues = zodResult.error.issues
          .map((i) => `- Campo "${i.path.join('.') || 'root'}": ${i.message}`)
          .join('\n');
        lastErrorSummary = `Erros de schema Zod:\n${issues}`;
      } else {
        const extraErrors = params.extraValidator
          ? params.extraValidator(zodResult.data)
          : [];
        if (extraErrors.length === 0) {
          return {
            data: zodResult.data,
            tokensUsed: totalTokens,
            providerUsed: config.provider,
            modelUsed: config.model,
          };
        }
        lastErrorSummary = `Erros de validação de domínio:\n${extraErrors.map((e) => `- ${e}`).join('\n')}`;
      }
    } catch (err) {
      lastErrorSummary = `Erro ao parsear JSON: ${sanitizeSensitiveText(err instanceof Error ? err.message : String(err))}`;
    }

    currentPrompt = `${params.userPrompt}

ATENÇÃO (Tentativa de correção ${attempt}/2):
Sua resposta anterior foi rejeitada pelo validador determinístico pelos seguintes motivos:
${lastErrorSummary}

Corrija TODOS os pontos acima e retorne EXCLUSIVAMENTE um objeto JSON válido aderente ao contrato exigido.`;
  }

  throw new Error(
    sanitizeSensitiveText(
      `A LLM (${config.provider}/${config.model}) falhou na validação determinística após 3 tentativas.\n${lastErrorSummary}`
    )
  );
}
