/**
 * ai.ts — Geração de resposta via Workers AI (Llama)
 *
 * Responsabilidade: montar o prompt com contexto RAG e pergunta do usuário,
 * invocar o modelo Llama via Workers AI e retornar o texto gerado.
 *
 * Decisão de arquitetura: Workers AI elimina necessidade de gerenciar
 * infraestrutura de GPU. O modelo @cf/meta/llama-3-8b-instruct oferece
 * boa qualidade com custo controlado. max_tokens limita gasto por resposta.
 *
 * Custo estimado: ~$0.11 por 1M tokens de entrada + saída (Llama 3 8B).
 */

// Modelo Llama disponível no Workers AI — ajuste conforme necessidade
// Opções: @cf/meta/llama-3-8b-instruct | @cf/meta/llama-3.1-8b-instruct
const MODEL = "@cf/meta/llama-3-8b-instruct";

// Limite de tokens de saída — ajusta latência e custo por resposta
const MAX_TOKENS = 512;

interface GenerateReplyOptions {
  context: string;
  question: string;
  env: { AI: Ai };
}

interface AiTextGenerationOutput {
  response?: string;
}

/**
 * generateReply — invoca o Llama com contexto RAG e retorna a resposta.
 *
 * @param options.context   Fragmentos de contexto recuperados pelo RAG
 * @param options.question  Pergunta original do usuário
 * @param options.env       Env com binding AI injetado pelo runtime
 * @returns                 Texto da resposta gerada pelo modelo
 */
export async function generateReply({
  context,
  question,
  env,
}: GenerateReplyOptions): Promise<string> {
  // Prompt estruturado com system + user para melhor qualidade de resposta
  const systemPrompt = context
    ? `Você é um assistente útil e preciso. Use o contexto abaixo para responder à pergunta do usuário. Se o contexto não for suficiente, responda com base no seu conhecimento geral.\n\nContexto:\n${context}`
    : "Você é um assistente útil e preciso. Responda de forma clara e concisa.";

  const messages: RoleScopedChatInput[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: question },
  ];

  console.log(`[ai] Invocando ${MODEL} com ${messages.length} mensagens`);

  const result = (await env.AI.run(MODEL, {
    messages,
    max_tokens: MAX_TOKENS,
  })) as AiTextGenerationOutput;

  const reply = result?.response?.trim() ?? "";

  if (!reply) {
    console.warn("[ai] Resposta vazia do modelo");
    return "Desculpe, não consegui gerar uma resposta no momento.";
  }

  return reply;
}
