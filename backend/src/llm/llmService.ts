/**
 * Motor de Execução de Modelos de IA (LLM Service)
 * Suporta:
 * 1. Google Gemini API (`GEMINI_API_KEY`) -> `gemini-2.5-flash` com Structured Output JSON
 * 2. OpenAI / Compatível (`OPENAI_API_KEY`) -> `gpt-4o-mini` com Structured Output JSON
 * 3. Síntese Inteligente Contextual (quando nenhuma chave externa estiver configurada),
 *    que constrói artefatos personalizados baseados no escopo real do usuário e nos dados vivos da internet.
 */

export interface LLMJsonCallParams {
  systemInstruction: string;
  userPrompt: string;
  temperature?: number;
}

export interface LLMJsonCallResult<T = Record<string, unknown>> {
  data: T;
  tokensUsed: number;
  providerUsed: 'gemini' | 'openai' | 'contextual-engine';
}

export async function callStructuredLLM<T = Record<string, unknown>>(
  params: LLMJsonCallParams,
  fallbackGenerator: () => Promise<{ data: T; tokensUsed: number }>
): Promise<LLMJsonCallResult<T>> {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();

  // 1. Google Gemini API (REST oficial v1beta)
  if (geminiKey) {
    try {
      const model = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: params.systemInstruction }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: params.userPrompt }],
            },
          ],
          generationConfig: {
            temperature: params.temperature ?? 0.3,
            responseMimeType: 'application/json',
          },
        }),
        signal: AbortSignal.timeout(25000),
      });

      if (res.ok) {
        const json = (await res.json()) as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
          }>;
          usageMetadata?: { totalTokenCount?: number };
        };

        const rawText =
          json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
        if (rawText) {
          const parsed = JSON.parse(rawText) as T;
          return {
            data: parsed,
            tokensUsed: json.usageMetadata?.totalTokenCount ?? 1500,
            providerUsed: 'gemini',
          };
        }
      }
    } catch (err) {
      console.warn(
        '[LLM Service] Falha ao chamar Gemini API, acionando motor contextual:',
        err instanceof Error ? err.message : err
      );
    }
  }

  // 2. OpenAI API (REST oficial v1/chat/completions)
  if (openaiKey) {
    try {
      const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: params.temperature ?? 0.3,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: params.systemInstruction },
            { role: 'user', content: params.userPrompt },
          ],
        }),
        signal: AbortSignal.timeout(25000),
      });

      if (res.ok) {
        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { total_tokens?: number };
        };
        const rawText = json.choices?.[0]?.message?.content?.trim() ?? '';
        if (rawText) {
          const parsed = JSON.parse(rawText) as T;
          return {
            data: parsed,
            tokensUsed: json.usage?.total_tokens ?? 1500,
            providerUsed: 'openai',
          };
        }
      }
    } catch (err) {
      console.warn(
        '[LLM Service] Falha ao chamar OpenAI API, acionando motor contextual:',
        err instanceof Error ? err.message : err
      );
    }
  }

  // 3. Motor Contextual Determinístico (Usa os dados reais coletados na internet + escopo do usuário)
  const fallback = await fallbackGenerator();
  return {
    data: fallback.data,
    tokensUsed: fallback.tokensUsed,
    providerUsed: 'contextual-engine',
  };
}
