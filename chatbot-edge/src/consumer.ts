/**
 * consumer.ts — Consumidor da Queue
 *
 * Responsabilidade: processar mensagens enfileiradas executando a pipeline
 * completa: RAG (Vectorize) → IA (Llama via Workers AI) → persistência (D1).
 *
 * Decisão de arquitetura: usar Queue desacopla latência da IA do tempo de
 * resposta do webhook. Retry automático da Queue garante resiliência sem
 * infraestrutura adicional. A estrutura modular facilita extensões como
 * fallback, rate-limiting por usuário e logs estruturados.
 */

import { getContext } from "./rag";
import { generateReply } from "./ai";
import { saveMessage } from "./db";

// Tipagem dos bindings definidos no wrangler.toml
export interface Env {
  QUEUE: Queue;
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  AI: Ai;
  ENVIRONMENT: string;
}

// Estrutura da mensagem trafegada na Queue
interface QueueMessage {
  from: string;
  text: string;
  timestamp: string;
}

export default {
  /**
   * queue — handler invocado pelo runtime para cada batch de mensagens.
   *
   * Cloudflare entrega mensagens em batches (até 100 por invocação).
   * Processamos sequencialmente para controlar consumo de tokens da IA
   * e evitar sobrecarga no D1. Em produção, avaliar processamento paralelo
   * com Promise.allSettled para maior throughput.
   */
  async queue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      const { from, text, timestamp } = msg.body;

      console.log(`[consumer] Processando mensagem de ${from} em ${timestamp}`);

      try {
        // 1. RAG: busca contexto semântico relevante no Vectorize
        // Custo: Vectorize cobra por dimensão × vetor consultado
        const context = await getContext(text, env.VECTORIZE);

        // 2. IA: gera resposta usando Llama via Workers AI
        // Custo: Workers AI cobra por unidade de neurônio (BNU) — Llama 3 ~$0.11/1M tokens
        const reply = await generateReply({ context, question: text, env });

        // 3. Persiste interação no D1 para histórico e analytics
        // Custo: D1 cobra por row escrito — extremamente barato
        await saveMessage({ from, text, reply, timestamp, db: env.DB });

        console.log(`[consumer] Resposta gerada e persistida para ${from}`);

        // Confirma processamento bem-sucedido ao runtime da Queue
        msg.ack();
      } catch (err) {
        // Em caso de erro, a mensagem volta para retry automático da Queue
        // Configura max_retries no wrangler.toml para evitar loops infinitos
        console.error(`[consumer] Erro ao processar mensagem de ${from}:`, err);
        msg.retry();
      }
    }
  },
};
