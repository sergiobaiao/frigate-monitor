# Plan — FleetWatch (técnico)

> Feature: `001-fleet-monitor` · Deriva de `spec.md` · Constrangido por `constitution.md`
> Stack: Next.js (App Router) + TypeScript + shadcn/ui + Tailwind + Zod + TanStack Query + Recharts + PostgreSQL + Prisma + BullMQ/Redis. Base visual: next-shadcn-dashboard-starter.

## 1. Arquitetura

```
┌────────────────────────────────────────────────────────────┐
│  Next.js App Router (UI + Route Handlers + Server Actions)   │
│  ─ dashboard, servers, cameras, events, settings, logs       │
└───────────────┬──────────────────────────────┬──────────────┘
                │ TanStack Query (read)         │ Server Actions (mutate, RBAC+audit)
                ▼                                ▼
        ┌───────────────── services (domain) ─────────────────┐
        │ ServerService · CheckService · SeverityEngine ·       │
        │ EventService · NotificationService · SecretService    │
        └───────┬───────────────────────────────┬──────────────┘
                │ Checker contract               │ Provider contract
        ┌───────▼────────┐              ┌─────────▼─────────────┐
        │  integrations  │              │  notification         │
        │  ssh · ha-api  │              │  telegram · whatsapp  │
        │  frigate-api   │              │  (evolution/twilio/   │
        │                │              │   meta)               │
        └───────┬────────┘              └───────────────────────┘
                │
   ┌────────────▼─────────────┐     ┌──────────────────────────┐
   │ Worker (BullMQ)          │     │ PostgreSQL (Prisma)       │
   │ scheduler + check queue  │◄────┤ servers, checks, events,  │
   │ + notify queue           │     │ notifications, audit, users│
   └──────────────────────────┘     └──────────────────────────┘
                ▲
                │ repeatable jobs (per-server interval)
         ┌──────┴───────┐
         │  Redis        │
         └──────────────┘
```

- **Processos**: (1) Next.js web; (2) Worker Node dedicado (mesmo codebase, entrypoint separado) consumindo as filas. Permite escalar worker sem escalar UI e respeita isolamento (P5).
- **Camadas**: UI → actions/route-handlers → services → integrations → db. Dependências para dentro (AR2).

## 2. Módulos
- `core/config` — env + schema Zod; thresholds padrão.
- `core/crypto` — envelope encryption (AES-256-GCM) de segredos; KMS opcional, master key via env em dev.
- `core/logger` — pino JSON + redaction (tokens/keys/headers).
- `domain/servers` — modelo, CRUD, grupos, teste de conexão.
- `domain/checks` — contrato `Checker`, registry, `SeverityEngine`.
- `domain/events` — máquina de estados de alerta (open/update/resolve), dedupe.
- `domain/notifications` — orquestração, templates, cooldown, retry, histórico (ÚLTIMO).
- `integrations/ssh` — pool de conexões (ssh2), exec read-only, captura stdout/stderr/exit/timestamp.
- `integrations/ha` — cliente REST do Home Assistant.
- `integrations/frigate` — cliente REST do Frigate.
- `jobs` — scheduler (repeatable), workers de check e de notify, locks.
- `web` — páginas/components shadcn.

## 3. APIs internas (contratos)
- `Checker<TCtx, TResult>`: `{ type; timeoutMs; run(ctx: ServerContext): Promise<CheckResult> }`.
- `CheckResult`: `{ type; severity; summary; metrics?; raw?(redacted); error?; durationMs; at }`.
- `NotificationProvider`: `{ id; send(msg: RenderedMessage): Promise<DeliveryResult> }`.
- Route handlers: `GET /api/health`, `GET /api/servers`, `GET /api/servers/:id/checks`, `GET /api/events`, etc. Mutations via Server Actions com guard RBAC + audit.

## 4. Integrações externas (com fontes oficiais)
- **Home Assistant REST API** — autenticação via long-lived access token (`Authorization: Bearer`); endpoints `GET /api/` (ping), `GET /api/states`, `GET /api/states/<entity_id>`. Supervisor/mounts via Supervisor API quando disponível em HAOS. Docs: https://www.home-assistant.io/docs/ (REST API: https://developers.home-assistant.io/docs/api/rest/). [verificar endpoint exato de mounts — Premissa A2]
- **Frigate API** — `GET /api/version`, `GET /api/stats` (cpu/gpu/detectors, e por câmera `camera_fps`/`detection_fps`/`process_fps`/`skipped_fps`), `GET /api/config`, e endpoints de recordings/storage. Docs: https://docs.frigate.video/ (integrations/api). [campos validados contra 0.17.x — Premissa A3]
- **Telegram Bot API** — `POST https://api.telegram.org/bot<token>/sendMessage` (`chat_id`, `text`, `parse_mode`). Docs: https://core.telegram.org/bots/api#sendmessage.
- **WhatsApp (adaptador)**:
  - Evolution API — `POST /message/sendText/{instance}` (provedor self-hosted).
  - Twilio — `POST /2010-04-01/Accounts/{sid}/Messages.json` (WhatsApp sender). Docs: https://www.twilio.com/docs/whatsapp.
  - Meta Cloud API — `POST /{phone-number-id}/messages`. Docs: https://developers.facebook.com/docs/whatsapp/cloud-api.

## 5. Modelo de dados (PostgreSQL via Prisma)
Entidades e relacionamentos principais:

- **User** (id, email, passwordHash, role[admin|operator|viewer], createdAt) 
- **ServerGroup** (id, name) 1—N **Server**
- **Server** (id, groupId?, name, type[ubuntu|haos], host, sshPort, haPort, frigatePort, intervalSec, minSeverity, enabled, channels[jsonb], thresholds[jsonb], createdAt, updatedAt)
- **Secret** (id, serverId, kind[ssh_key|ssh_password|ha_token|frigate_token|notify_*], ciphertext, iv, tag, keyVersion) — 1—N por Server; nunca exposto via API.
- **CheckRun** (id, serverId, type, severity, summary, metrics[jsonb], stdout?, stderr?, exitCode?, error?, durationMs, startedAt, finishedAt, correlationId) — N por Server. Raw redatado.
- **Event** (id, serverId, checkType, dedupeKey, severity, status[open|resolved], openedAt, resolvedAt?, lastSeenAt, lastNotifiedAt?) — máquina de estado de alerta.
- **Notification** (id, eventId, channel, provider, status[sent|failed|retrying], attempts, payloadRedacted, error?, createdAt) — histórico de envio.
- **AuditLog** (id, actorId, action, entity, entityId, before[jsonb redacted], after[jsonb redacted], at, ip) — imutável.
- **CameraStat** (id, checkRunId, serverId, cameraName, storageBytes, pctTotal, bandwidthKbps, fps, lastFrameAt) — snapshot por ciclo, para gráficos/tabelas.
- **DiskStat** (id, checkRunId, serverId, mount, totalBytes, freeBytes, usedBytes, usedPct) — para gráficos de disco.

Índices: `Server(enabled)`, `CheckRun(serverId, startedAt desc)`, `CheckRun(correlationId)`, `Event(serverId, status)`, `Event(dedupeKey)` unique-partial em status=open, `Notification(eventId)`, `CameraStat(serverId, cameraName, checkRunId)`, `DiskStat(serverId, mount, checkRunId)`, `AuditLog(entity, entityId)`.

## 6. Autenticação/Autorização
- Auth via Auth.js (NextAuth) com credentials provider + session JWT; senhas com argon2/bcrypt.
- RBAC por middleware/guard nas Server Actions e route handlers: `admin` (tudo), `operator` (ver + reconhecer alertas, sem editar credenciais), `viewer` (somente leitura).
- Todo mutate passa por `withAudit(action)` que grava AuditLog com before/after redatados.
- Rate limit (e.g. `@upstash/ratelimit` ou middleware próprio) em login e mutations.

## 7. Estratégia — Ubuntu Linux (A1 confirmada)
- SSH via `ssh2` (chave preferida; senha cifrada como fallback). Verificação de host key (fingerprint salvo no Server).
- Comandos read-only (uma sessão SSH, dois comandos):
  - **`frigate-status.sh --json`** → fonte primária de métricas (limpo, sem ANSI): `ssd/hd {usage_percent,total,available,recording_days,clips/exports/snapshots_files}`, `frigate.status` (running/stopped/missing/no-docker), `config`. Path real do script no projeto: `scripts/frigate-status.sh` (deploy em `/usr/local/sbin/`). Capturar stdout/stderr/exitCode/timestamp (RF-11).
  - **`frigate-status.sh --check`** → severidade autoritativa do próprio script: exit `0`/`1`/`2` + linhas `OK:`/`WARNING:`/`CRITICAL:`. `SeverityEngine` usa o exit code como base e cruza com thresholds do servidor.
  - **Caveat parser (fixture obrigatória):** `--json` interpola `usage_percent: -` quando disco ausente → JSON inválido. Parser deve detectar e mapear para CRITICAL "disco não encontrado". `hd.mounted:false` → CRITICAL. Thresholds do script: `WARN=75`/`CRIT=90` (do `.env`), distintos de `min_free_pct`/`emergency_threshold` (limpeza). 
  - Disco (RF-15): métricas já vêm do `--json`; `df -PB1` complementar opcional para mounts fora do escopo do script → DiskStat.
- Timeout SSH configurável (RNF-03); pool com reuso por servidor; lock por servidor (RN-11).

## 8. Estratégia — HAOS (A2 confirmada)
- Sem assumir SSH no host (P3/RF-12). Dois caminhos de acesso ao Supervisor, em ordem de preferência:
  - **Caminho 1 (preferido) — proxy HA Core**: `GET http://<ha>:8123/api/hassio/<path>` com **long-lived access token** do HA, que repassa ao Supervisor. Requer componente `hassio` (presente em HAOS). [validar disponibilidade do proxy em T042; usuário pode fornecer token]
  - **Caminho 2 (fallback) — entidades via `/api/states`**: ler sensores expostos (Frigate HA integration: binary_sensors por câmera; System Monitor: `sensor.disk_use_percent_*`) com long-lived token. Sempre funciona, porém cobre menos (mounts podem não ter entidade).
- **Frigate up** (RF-12): Supervisor `GET /addons/<slug>/info` → `state=="started"`; cruzar com Frigate `/api/version` + `/api/stats` acessível.
- **Storage de rede** (RF-13): Supervisor `GET /mounts` → cada mount tem `state`; `!= "active"` ou ausente vs. lista esperada por servidor (`HD_Externo`, `frigate`) → CRITICAL (screenshot 2). Fallback: persistent notification / repair se proxy indisponível.
- **Disco** (RF-15 em HAOS): Supervisor `GET /host/info` (`disk_total/used/free`) e/ou sensores System Monitor → DiskStat.
- Equivalente ao `frigate-status.sh` = agregador desses sinais aplicando a **mesma `SeverityEngine`**, produzindo `CheckResult` análogo ao do Ubuntu.
- Fonte: https://developers.home-assistant.io/docs/api/supervisor/endpoints · https://developers.home-assistant.io/docs/api/rest/

## 9. Estratégia — Frigate API (A3: versão única 0.17.1)
- Cliente tipado (Zod nos responses), travado em 0.17.1 (`/api/version` valida no cadastro).
- `/api/stats`: per-camera `camera_fps`/`detection_fps`/`process_fps`/`skipped_fps` (RF-16 câmera com imagem), `detectors`, `gpu_usages`, e `service.storage.<path>{total,used,free}` + `service.uptime`/`version`.
- `/api/config`: lista de câmeras + retenção configurada.
- Endpoint de recordings/storage por câmera (storage bytes, %, bandwidth, dias — screenshot 3): **path exato validado em runtime contra a instância 0.17.1 em T041** (a UI System→Storage consome esse endpoint; confirmar nome/shape antes de fixar o cliente).
- Derivar: total recordings usado/total, por câmera storage/%/bandwidth/dias, earliest recording → CameraStat.

## 10. Estratégia — checagem visual UI/câmeras
- **Primária (API, barata e confiável)**: por câmera em `/api/stats`, `camera_fps`/`detection_fps` > 0 e frame recente → "exibindo imagem". fps 0 / stale → câmera sem imagem (RF-16, CA-04). É o método recomendado por documentação do Frigate para saúde de câmera.
- **Secundária (opcional, sob flag)**: requisitar `latest.jpg`/snapshot da câmera e validar que retornou imagem não-vazia/recente. Evita render de browser headless por padrão (custo/complexidade).
- **Terciária (opcional, fora do caminho crítico)**: validação visual da própria UI via Playwright headless apenas para verificação periódica profunda; NÃO no ciclo de alta frequência.

## 11. Estratégia de notificações (IMPLEMENTAR POR ÚLTIMO — P6/C3)
- Fila `notify` separada da fila `check`. EventService decide disparo (RN-01..RN-05); enfileira mensagem renderizada.
- Templates por severidade/tipo (RF-32); render sem segredos.
- Dedupe via `Event.dedupeKey` + estado open; cooldown via `lastNotifiedAt`; retry com backoff exponencial; histórico em `Notification`.
- Providers atrás de `NotificationProvider`; seleção por config do servidor (telegram/whatsapp/ambos) e provedor WhatsApp por env.

## 12. Observabilidade
- pino JSON + correlationId por ciclo (`run:<uuid>`) propagado a checks/notify.
- Métricas (prom-client `/api/metrics` ou OTEL): `check_duration_ms{type}`, `check_failures_total{server}`, `queue_depth{queue}`, `notify_delivery_total{channel,status}`.
- `/api/health`: DB ping, Redis ping, worker heartbeat.

## 13. Complexity Tracking
- Worker separado + Redis adicionam infra vs. cron in-process. Justificativa: isolamento (P5), não-sobreposição (RN-11), retry/backoff confiável. Aceito.
- Playwright (visual terciário) é opcional/flagged para não inflar o caminho crítico. Aceito como não-padrão.
