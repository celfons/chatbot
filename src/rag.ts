/**
 * rag.ts — Retrieval-Augmented Generation via Cloudflare Vectorize
 *
 * Responsabilidade: converter a pergunta do usuário em embedding e buscar
 * os K vetores mais similares no índice Vectorize, retornando os metadados
 * como contexto para o modelo de linguagem.
 *
 * Decisão de arquitetura: RAG aumenta a precisão do modelo sem fine-tuning,
 * reduzindo custos de treinamento. topK=5 equilibra qualidade do contexto
 * e número de tokens enviados ao Llama (impacta latência e custo).
 *
 * Pré-requisito: vetores devem ser indexados previamente via
 * `wrangler vectorize insert` com metadados { text: "..." }.
 */

const TOP_K = 5;

/**
 * getContext — busca contexto semântico relevante para a query.
 *
 * @param query   Pergunta ou texto do usuário
 * @param index   Binding do Vectorize (injetado pelo runtime)
 * @returns       Texto de contexto concatenado para uso no prompt
 */
export async function getContext(query: string, index: VectorizeIndex): Promise<string> {
  // Gera embedding da query usando o modelo text-embedding integrado ao Vectorize
  // Nota: em produção, usar o mesmo modelo utilizado na indexação dos documentos
  const queryVector = await index.query(
    // Vectorize aceita vetores numéricos; aqui usamos query por texto
    // quando o índice foi criado com preset text-embeddings
    query as unknown as number[],
    {
      topK: TOP_K,
      returnMetadata: "all",
    }
  );

  if (!queryVector.matches || queryVector.matches.length === 0) {
    console.log("[rag] Nenhum contexto encontrado para a query");
    return "";
  }

  // Concatena os textos dos vetores mais relevantes como contexto
  const contextParts = queryVector.matches
    .filter((match) => match.metadata?.text)
    .map((match, i) => `[${i + 1}] ${match.metadata!.text as string}`);

  const context = contextParts.join("\n\n");
  console.log(`[rag] ${contextParts.length} fragmentos de contexto recuperados`);

  return context;
}
