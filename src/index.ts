/**
 * index.ts — Entry point do Worker principal
 *
 * Responsabilidade: receber webhooks (simulando WhatsApp), validar o payload
 * e enfileirar a mensagem na Queue para processamento assíncrono.
 *
 * Decisão de arquitetura: separar recebimento de processamento garante
 * resposta imediata ao webhook e evita timeouts em caso de lentidão na
 * pipeline de IA/RAG. O Worker nunca bloqueia aguardando o Llama.
 */

import type { Env } from "./consumer";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Aceita apenas POST
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Valida Content-Type
    const contentType = request.headers.get("Content-Type") ?? "";
    if (!contentType.includes("application/json")) {
      return new Response(JSON.stringify({ error: "Expected application/json" }), {
        status: 415,
        headers: { "Content-Type": "application/json" },
      });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Validação mínima do payload (simulando estrutura de webhook WhatsApp)
    const payload = body as Record<string, unknown>;
    const from = payload?.from as string | undefined;
    const text = (payload?.message as Record<string, unknown>)?.text as string | undefined;

    if (!from || typeof from !== "string" || !text || typeof text !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing required fields: from, message.text" }),
        { status: 422, headers: { "Content-Type": "application/json" } }
      );
    }

    // Normaliza e prepara mensagem para a fila
    const queueMessage = {
      from: from.trim(),
      text: text.trim(),
      timestamp: new Date().toISOString(),
    };

    // Envia para a Queue — operação barata e não-bloqueante
    // Custo: Cloudflare Queues tem 1M mensagens/mês no plano gratuito
    await env.QUEUE.send(queueMessage);

    console.log(`[index] Mensagem enfileirada de: ${queueMessage.from}`);

    return new Response(
      JSON.stringify({ status: "queued", from: queueMessage.from }),
      { status: 202, headers: { "Content-Type": "application/json" } }
    );
  },
};
