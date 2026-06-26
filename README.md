# chatbot-edge

Chatbot serverless construído sobre **Cloudflare Workers**, com arquitetura orientada a eventos, RAG via **Vectorize** e geração de linguagem natural via **Workers AI (Llama 3)**.

---

## 🏗️ Arquitetura

```
HTTP Webhook
     │
     ▼
┌─────────────────┐
│  Worker (HTTP)  │  ← index.ts
│  Valida payload │
│  Enfileira msg  │
└────────┬────────┘
         │ Queue (async)
         ▼
┌─────────────────┐
│    Consumer     │  ← consumer.ts
│  (Queue Worker) │
└────┬───────┬────┘
     │       │
     ▼       ▼
 Vectorize   D1
  (RAG)    (persist)
     │
     ▼
 Workers AI
  (Llama 3)
     │
     ▼
  Resposta
 persistida
```

### Fluxo completo

```
webhook → queue → consumer → rag (Vectorize) → ai (Llama) → resposta → D1
```

1. **Webhook** chega via POST em `/`
2. O Worker valida e normaliza o payload
3. A mensagem é enviada para a **Queue** (retorno HTTP imediato — 202)
4. O **Consumer** é invocado assincronamente pelo runtime
5. O Consumer chama `getContext()` no **Vectorize** (busca semântica)
6. O contexto + pergunta são enviados ao **Workers AI (Llama 3)**
7. A resposta gerada é persistida no **D1**

---

## 🧩 Serviços Cloudflare utilizados

| Serviço | Função | Plano gratuito |
|---|---|---|
| **Workers** | Execução serverless na edge (130+ PoPs) | 100k req/dia |
| **Queues** | Desacoplamento assíncrono entre recebimento e processamento | 1M msgs/mês |
| **Vectorize** | Banco de vetores para busca semântica (RAG) | 5M dims/mês |
| **D1** | SQLite na edge para persistência de histórico | 5GB + 5M writes/mês |
| **Workers AI** | Inferência serverless com modelos como Llama 3 | 10k neurônios/dia |

---

## 🚀 Como rodar

### Pré-requisitos

- Conta Cloudflare com Workers, D1, Vectorize e AI habilitados
- Node.js 18+
- `wrangler` CLI autenticado (`wrangler login`)

### Instalação

```bash
npm install
```

### Criar recursos na Cloudflare

```bash
# 1. Criar banco D1
wrangler d1 create chatbot-db
# Copie o database_id gerado e atualize o wrangler.toml

# 2. Inicializar schema
wrangler d1 execute chatbot-db --command \
  "CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user TEXT NOT NULL,
    message TEXT NOT NULL,
    reply TEXT NOT NULL,
    created_at TEXT NOT NULL
  );"

# 3. Criar índice Vectorize
wrangler vectorize create chatbot-index --dimensions=768 --metric=cosine

# 4. Criar Queue
wrangler queues create chatbot-queue
```

### Desenvolvimento local

```bash
npm run dev
# Worker disponível em http://localhost:8787
```

### Deploy

```bash
npm run deploy
```

---

## 📨 Exemplo de payload

```json
{
  "from": "+5511999990000",
  "message": {
    "text": "Qual é a política de reembolso?"
  }
}
```

**Resposta imediata (202):**

```json
{
  "status": "queued",
  "from": "+5511999990000"
}
```

---

## ⚖️ Trade-offs

| Decisão | Vantagem | Desvantagem |
|---|---|---|
| Queue assíncrona | Resposta imediata; resiliente a falhas da IA | Resposta não retorna diretamente ao usuário via HTTP |
| D1 (SQLite) | Latência baixa, custo quase zero | Sem transações distribuídas; limite de 1GB por banco no plano free |
| Vectorize topK=5 | Boa qualidade de contexto com custo controlado | Contexto maior pode melhorar respostas mas aumenta tokens |
| Llama 3 8B | Boa relação custo/qualidade | Modelos maiores (70B) são mais precisos mas mais caros |
| Workers AI | Zero ops de GPU | Modelos disponíveis são fixos; sem fine-tuning fácil |
| Single-region D1 | Simplicidade | Latência maior para usuários geograficamente distantes do PoP principal |

---

## 📁 Estrutura do projeto

```
chatbot-edge/
├── src/
│   ├── index.ts      # Worker HTTP: valida webhook e enfileira
│   ├── consumer.ts   # Consumer da Queue: pipeline RAG → AI → D1
│   ├── rag.ts        # Busca semântica via Vectorize
│   ├── ai.ts         # Geração de resposta via Workers AI (Llama)
│   └── db.ts         # Persistência no D1 (SQLite)
├── wrangler.toml     # Bindings e configuração do Worker
├── package.json      # Scripts e dependências
├── tsconfig.json     # Configuração TypeScript para Workers
└── .gitignore
```
