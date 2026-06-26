/**
 * db.ts — Persistência de mensagens via Cloudflare D1
 *
 * Responsabilidade: inicializar o schema do banco e persistir cada interação
 * (mensagem recebida + resposta gerada) para histórico e analytics.
 *
 * Decisão de arquitetura: D1 é SQLite na edge — baixíssima latência para
 * leituras locais e custo muito reduzido (5GB + 5M rows/mês no plano gratuito).
 * Ideal para chatbots de volume moderado. Para escala muito alta, considerar
 * Hyperdrive + PostgreSQL externo.
 *
 * Uso: executar initDB() uma vez (ex.: via wrangler d1 execute) antes do deploy.
 */

interface SaveMessageOptions {
  from: string;
  text: string;
  reply: string;
  timestamp: string;
  db: D1Database;
}

/**
 * initDB — cria a tabela de mensagens se ainda não existir.
 *
 * Deve ser executado durante setup inicial:
 *   wrangler d1 execute chatbot-db --command "$(node -e "require('./src/db').SQL_INIT")"
 * Ou via migration no pipeline de CI/CD.
 */
export const SQL_INIT = `
  CREATE TABLE IF NOT EXISTS messages (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user TEXT    NOT NULL,
    message   TEXT    NOT NULL,
    reply     TEXT    NOT NULL,
    created_at TEXT   NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_user);
  CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
`;

export async function initDB(db: D1Database): Promise<void> {
  await db.exec(SQL_INIT);
  console.log("[db] Schema inicializado com sucesso");
}

/**
 * saveMessage — persiste uma interação (pergunta + resposta) no D1.
 *
 * Usa prepared statement para evitar SQL injection e melhorar performance
 * (D1 faz cache de prepared statements).
 */
export async function saveMessage({
  from,
  text,
  reply,
  timestamp,
  db,
}: SaveMessageOptions): Promise<void> {
  await db
    .prepare(
      "INSERT INTO messages (from_user, message, reply, created_at) VALUES (?, ?, ?, ?)"
    )
    .bind(from, text, reply, timestamp)
    .run();

  console.log(`[db] Mensagem de ${from} persistida`);
}

/**
 * getHistory — recupera histórico recente de um usuário.
 * Útil para implementar memória conversacional futura.
 *
 * @param from  Identificador do usuário (número de telefone, etc.)
 * @param limit Número máximo de mensagens a retornar
 */
export async function getHistory(
  from: string,
  limit: number = 10,
  db: D1Database
): Promise<{ message: string; reply: string; created_at: string }[]> {
  const { results } = await db
    .prepare(
      "SELECT message, reply, created_at FROM messages WHERE from_user = ? ORDER BY created_at DESC LIMIT ?"
    )
    .bind(from, limit)
    .all<{ message: string; reply: string; created_at: string }>();

  return results ?? [];
}
