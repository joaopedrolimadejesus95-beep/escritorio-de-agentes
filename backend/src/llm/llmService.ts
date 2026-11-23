import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_LOCAL_PATH = path.resolve(__dirname, '../../.env.local');

export type LLMProviderType = 'gemini' | 'anthropic' | 'openai' | 'ollama';

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
  ollamaAvailable: boolean;
}

export class LLMNotConfiguredError extends Error {
  public readonly code = 'LLM_NOT_CONFIGURED';
  constructor(
    message = 'Nenhum provedor de IA configurado. Configure sua chave Gemini, Anthropic, OpenAI ou ative o Ollama local no botão "Configurar IA" no topo da tela.'
  ) {
    super(message);
    this.name = 'LLMNotConfiguredError';
  }
}

let runtimeConfig: LLMRuntimeConfig | null = null;

/**
 * Carrega variáveis de `backend/.env.local` (ignorado pelo git) no startup, se existir.
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
}

export async function saveRuntimeLLMConfig(
  config: LLMRuntimeConfig,
  persistLocal = true
): Promise<LLMStatusDTO> {
  runtimeConfig = {
    provider: config.provider,
    model: config.model.trim(),
    apiKey: config.apiKey?.trim(),
    baseUrl: config.baseUrl?.trim(),
  };

  if (config.provider === 'gemini' && config.apiKey) {
    process.env.GEMINI_API_KEY = config.apiKey.trim();
    process.env.GEMINI_MODEL = config.model.trim();
  } else if (config.provider === 'anthropic' && config.apiKey) {
    process.env.ANTHROPIC_API_KEY = config.apiKey.trim();
    process.env.ANTHROPIC_MODEL = config.model.trim();
  } else if (config.provider === 'openai' && config.apiKey) {
    process.env.OPENAI_API_KEY = config.apiKey.trim();
    process.env.OPENAI_MODEL = config.model.trim();
  } else if (config.provider === 'ollama') {
    process.env.OLLAMA_MODEL = config.model.trim();
    if (config.baseUrl) {
      process.env.OLLAMA_BASE_URL = config.baseUrl.trim();
    }
  }

  if (persistLocal) {
    const lines = [
      `LLM_PROVIDER=${config.provider}`,
      config.provider === 'gemini' && config.apiKey
        ? `GEMINI_API_KEY=${config.apiKey.trim()}`
        : '',
      config.provider === 'gemini' ? `GEMINI_MODEL=${config.model.trim()}` : '',
      config.provider === 'anthropic' && config.apiKey
        ? `ANTHROPIC_API_KEY=${config.apiKey.trim()}`
        : '',
      config.provider === 'anthropic'
        ? `ANTHROPIC_MODEL=${config.model.trim()}`
        : '',
      config.provider === 'openai' && config.apiKey
        ? `OPENAI_API_KEY=${config.apiKey.trim()}`
        : '',
      config.provider === 'openai' ? `OPENAI_MODEL=${config.model.trim()}` : '',
      config.provider === 'ollama' ? `OLLAMA_MODEL=${config.model.trim()}` : '',
      config.provider === 'ollama' && config.baseUrl
        ? `OLLAMA_BASE_URL=${config.baseUrl.trim()}`
        : '',
    ].filter(Boolean);

    await fs.writeFile(ENV_LOCAL_PATH, lines.join('\n') + '\n', 'utf-8');
  }

  return await getLLMStatus();
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

function maskApiKey(key?: string): string | null {
  if (!key || key.length < 8) return null;
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export function resolveActiveLLMConfig(): LLMRuntimeConfig | null {
  if (runtimeConfig) {
    if (runtimeConfig.provider === 'ollama' || runtimeConfig.apiKey) {
      return runtimeConfig;
    }
  }

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

export async function getLLMStatus(): Promise<LLMStatusDTO> {
  const active = resolveActiveLLMConfig();
  const ollamaAvailable = await checkOllamaHealth();

  if (!active && ollamaAvailable) {
    return {
      configured: true,
      provider: 'ollama',
      model: process.env.OLLAMA_MODEL?.trim() || 'llama3.1',
      maskedKey: null,
      ollamaAvailable: true,
    };
  }

  return {
    configured: Boolean(active),
    provider: active?.provider ?? null,
    model: active?.model ?? null,
    maskedKey: maskApiKey(active?.apiKey),
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
  // Remove fences ```json ... ``` se o modelo retornar markdown wrapper
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenceMatch?.[1]?.trim() || trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    // Tenta extrair o primeiro objeto JSON balanceado
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

    // Monta lista ordenada começando pelo modelo preferido + fallbacks em caso de 503/429/404
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
        const msg = err instanceof Error ? err.message : String(err);
        const isTransientOrUnavailable =
          /\b(503|504|429|404|UNAVAILABLE|DEADLINE_EXCEEDED|RESOURCE_EXHAUSTED|high demand|not found|timed? out|ETIMEDOUT)\b/i.test(
            msg
          );
        if (!isTransientOrUnavailable) {
          throw err;
        }
        console.warn(
          `[LLM Service] Modelo ${candidateModel} indisponível/sobrecarregado (${msg.slice(0, 90)}). Tentando próximo fallback...`
        );
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(String(lastError));
  }

  if (config.provider === 'anthropic') {
    if (!config.apiKey) throw new LLMNotConfiguredError();
    const base = config.baseUrl || 'https://api.anthropic.com/v1';
    const res = await fetch(`${base}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: params.maxTokens ?? 8192,
        temperature: params.temperature ?? 0.25,
        system: `${params.systemInstruction}\n\nRetorne EXCLUSIVAMENTE um objeto JSON válido, sem markdown ou texto adicional.`,
        messages: [{ role: 'user', content: params.userPrompt }],
      }),
      signal: AbortSignal.timeout(90000),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(
        `Anthropic API HTTP ${res.status}: ${errBody.slice(0, 300)}`
      );
    }

    const json = (await res.json()) as {
      content?: Array<{ type?: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const rawText = (json.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('')
      .trim();

    if (!rawText) {
      throw new Error('Anthropic API retornou resposta vazia.');
    }

    return {
      rawText,
      tokensUsed:
        (json.usage?.input_tokens ?? 0) + (json.usage?.output_tokens ?? 0) ||
        1800,
    };
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
      const errBody = await res.text();
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
    const errBody = await res.text();
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
 * Executa chamada real ao provedor LLM com validação estrita por Zod e
 * loop automático de auto-reparo (até 2 correções caso o JSON viole o schema).
 * Zero mocks ou respostas fictícias.
 */
export async function generateValidatedJson<TSchema extends z.ZodTypeAny>(params: {
  systemInstruction: string;
  userPrompt: string;
  schema: TSchema;
  temperature?: number;
  maxTokens?: number;
  extraValidator?: (data: z.infer<TSchema>) => string[];
}): Promise<LLMJsonCallResult<z.infer<TSchema>>> {
  let config = resolveActiveLLMConfig();

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

  if (!config) {
    throw new LLMNotConfiguredError();
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
      lastErrorSummary = `Erro ao parsear JSON: ${err instanceof Error ? err.message : String(err)}`;
    }

    // Reenvia os erros exatos para a LLM corrigir a própria entrega
    currentPrompt = `${params.userPrompt}

ATENÇÃO (Tentativa de correção ${attempt}/2):
Sua resposta anterior foi rejeitada pelo validador determinístico pelos seguintes motivos:
${lastErrorSummary}

Corrija TODOS os pontos acima e retorne EXCLUSIVAMENTE um objeto JSON válido aderente ao contrato exigido.`;
  }

  throw new Error(
    `A LLM (${config.provider}/${config.model}) falhou na validação determinística após 3 tentativas.\n${lastErrorSummary}`
  );
}
