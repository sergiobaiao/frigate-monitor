# Tasks — FleetWatch

> Deriva de `plan.md`. Ordem respeita Constitution C3: **notificações por último**.
> `[P]` = paralelizável. Cada tarefa tem critério de verificação. TDD onde marcado.

## Fase 0 — Setup do projeto ✅ CONCLUÍDA
- [x] T001 Bootstrap Next.js 16 (App Router, TS strict, src/) → app builda; typecheck/lint verdes.
- [x] T002 Tailwind v4 + shadcn/ui (button/card/sonner + lib/utils cn) → componentes presentes.
- [x] T003 ESLint 9 + Prettier (+tailwind plugin) + Husky pre-commit + lint-staged → hook em `.husky/pre-commit`.
- [x] T004 Zod env loader `src/core/config/env.ts` (parseEnv fail-fast) → 3 testes verdes.
- [x] T005 Logger pino + `redactSecrets` `src/core/logger/` → 3 testes verdes (redação em profundidade).
- [x] T006 Docker Compose dev (postgres:16 + redis:7, healthchecks) → `docker-compose.yml`. App/worker containers ficam p/ Fase 12.
- [x] T007 CI GitHub Actions (`.github/workflows/ci.yml`): install+typecheck+lint+test.

## Fase 1 — Banco de dados ✅ CONCLUÍDA
- [x] T010 Prisma 7 + `prisma.config.ts` + `@prisma/adapter-pg` (driver adapter — Prisma 7 WASM) → `prisma migrate dev` aplica.
- [x] T011 Schema: User/ServerGroup/Server/Secret (+ enums Role/ServerType/Severity/SecretKind) → migration + client em `src/generated/prisma`.
- [x] T012 Schema: CheckRun/Event/Notification/AuditLog (+ enums EventStatus/NotificationStatus) → migration aplicada.
- [x] T013 Schema: CameraStat/DiskStat + todos os 10 índices do plan.md §5 → verificado via `migration.sql`.
- [x] T014 Seed (`prisma/seed.ts` via tsx): admin@fleetwatch.local + grupo "Exemplo" + servidor desabilitado → idempotente, roda limpo.

## Fase 2 — Crypto & Auth ✅ CONCLUÍDA
- [x] T020 `core/crypto`: AES-256-GCM + HKDF-SHA256 deriveKey via node:crypto. SECRET_ENC_KEY no env. 10 testes (TDD).
- [x] T021 Auth.js v5 (next-auth@beta) credentials + bcryptjs (argon2 bloqueado por build nativo). JWT session. sign-in page shadcn.
- [x] T022 RBAC: requireRole (Server Actions) + guardRoute (Route Handlers) + middleware Next.js. 5 testes hierarquia.
- [x] T023 withAudit: fire-and-forget audit, redactSecrets em before/after, vi.hoisted() fix. 5 testes.
- [x] T024 rate-limiter-flexible in-memory: auth 10/15min, mutation 100/min. RateLimitError com retryAfterSec.

## Fase 3 — Cadastro de servidores ✅ CONCLUÍDA
- [x] T030 Zod schemas de Server/Group + SecretService (grava cifrado) → verify: segredo nunca em claro no DB (unit).
- [x] T031 CRUD servidores (Server Actions + UI shadcn) → verify: criar/editar/excluir e2e.
- [x] T032 [P] Grupos + agrupamento na UI → verify: servidor aparece no grupo.
- [x] T033 [P] Teste de conexão ao salvar (ping/SSH/HA/Frigate) sem persistir segredo em claro → verify: resultado exibido (RF-04).
- [x] T034 Página de configurações (servidor/grupos/usuários) → verify: RF-45.

## Fase 4 — Integrações (adaptadores)
- [ ] T040 `integrations/ssh` (ssh2): exec read-only, captura stdout/stderr/exit/timestamp, host-key verify → verify: integração contra container SSH fixture (TDD).
- [ ] T041 [P] `integrations/frigate`: cliente tipado + Zod; `/api/version`,`/api/stats`,`/api/config`,recordings → verify: parse de fixtures 0.17.x.
- [ ] T042 [P] `integrations/ha`: cliente REST + token; states + Supervisor mounts/host info → verify: parse de fixtures.
- [ ] T043 Fixtures versionadas OK/warning/critical/malformado para os 3 (incl. output do frigate-status.sh do screenshot) → verify: Q2.

## Fase 5 — Checkers & SeverityEngine
- [ ] T050 Contrato `Checker` + registry + `ServerContext` → verify: unit.
- [ ] T051 `SeverityEngine` com regras RN-Severidade + thresholds por servidor → verify: matriz de casos (TDD, ≥90% — Q3).
- [ ] T052 Checker conectividade (RF-10) → verify: up/down/latência (CA-09 isolamento).
- [ ] T053 Checker frigate-status Ubuntu (RF-11): SSH `--json` (métricas) + `--check` (exit 0/1/2 + linhas). Parser tolera `usage_percent: -` (JSON inválido → CRITICAL) e `mounted:false`. → verify: CA-01, CA-02 (screenshot 1) + fixture malformada.
- [ ] T054 Checker frigate-status HAOS (RF-12): agregador add-on+stats → verify: estados.
- [ ] T055 Checker storage de rede HAOS (RF-13) → verify: CA-03 (screenshot 2).
- [ ] T056 Checker gravações Frigate por câmera (RF-14) → CameraStat → verify: totais e por câmera (screenshot 3).
- [ ] T057 Checker disco (RF-15): `df -PB1` Ubuntu / sensores HAOS → DiskStat → verify: %/livre/usado.
- [ ] T058 Checker câmera-com-imagem (RF-16): fps/stale via stats → verify: CA-04 (screenshot 4).

## Fase 6 — Eventos & estado
- [ ] T060 EventService: máquina open/update/resolved + dedupeKey → verify: transições (CA-05/CA-06) (TDD).
- [ ] T061 Persistência CheckRun (raw redatado) + correlationId → verify: RF-20, CA-08.
- [ ] T062 [P] UNKNOWN-escalation por N ciclos (RN-05) → verify: unit.

## Fase 7 — Scheduler & worker
- [ ] T070 Redis + BullMQ setup; filas `check` e `notify` → verify: jobs enfileiram/consomem.
- [ ] T071 Repeatable jobs por servidor no `intervalo`; desabilitado não agenda (RN-10) → verify: agenda dinâmica reflete CRUD.
- [ ] T072 Lock por servidor (não sobrepor — RN-11) + timeout por tipo (RNF-03) → verify: ciclo lento é pulado/registrado.
- [ ] T073 Isolamento de falha por servidor (P5) → verify: CA-09.
- [ ] T074 Worker entrypoint separado + heartbeat → verify: roda standalone.

## Fase 8 — Dashboard & páginas
- [ ] T080 Visão geral de saúde da frota (contadores + grid) com TanStack Query → verify: RF-40, US3.
- [ ] T081 [P] Card por servidor (status/último check/resumo) → verify: RF-41.
- [ ] T082 [P] Tabela de câmeras por servidor → verify: RF-42, US5.
- [ ] T083 [P] Gráficos de disco (Recharts, histórico DiskStat) → verify: RF-43, US6.
- [ ] T084 [P] Timeline de eventos (global + por servidor) → verify: RF-44, US10.
- [ ] T085 [P] Página de logs/checks (stdout/stderr/exit/timestamp) → verify: RF-46, US8.

## Fase 9 — Notificações (ÚLTIMO — P6/C3)
- [ ] T090 `NotificationProvider` + templates por severidade/tipo (sem segredo) → verify: render unit.
- [ ] T091 Provider Telegram (`sendMessage`) → verify: integração mock + 1 envio real sandbox.
- [ ] T092 [P] Provider WhatsApp adaptável (Evolution/Twilio/Meta por env) → verify: mock por provedor.
- [ ] T093 Orquestração: dedupe + cooldown + retry/backoff + histórico Notification → verify: CA-05/CA-06 (TDD).
- [ ] T094 Respeitar canais ativos + severidade mínima por servidor (RF-34) → verify: RN-01.

## Fase 10 — Testes (transversal, contínuo)
- [ ] T100 Unit: parsers, SeverityEngine, dedupe/cooldown (≥90% regras) → verify: Q3.
- [ ] T101 Integração: checkers contra fixtures/containers → verify: 3 integrações.
- [ ] T102 e2e (Playwright): cadastro de servidor, ciclo de check, abertura/fechamento de alerta → verify: fluxos críticos.

## Fase 11 — Hardening
- [ ] T110 Auditoria de redaction em todos os logs/erros → verify: CA-08, scan automatizado.
- [ ] T111 [P] Revisão RBAC + rate limit + headers de segurança → verify: pentest checklist básico.
- [ ] T112 [P] Tratamento de erro seguro (sem stack/segredo ao usuário) → verify: S3.
- [ ] T113 Carga: 50 servidores / 1000 câmeras simulados → verify: RNF-01/RNF-05.

## Fase 12 — Observabilidade & Deploy
- [ ] T120 `/api/health` (DB/Redis/worker) → verify: CA-10.
- [ ] T121 [P] Métricas (check/queue/notify) → verify: endpoint expõe métricas.
- [ ] T122 Docker imagens (web+worker) + compose prod + migrations no boot → verify: stack sobe limpa.
- [ ] T123 Runbook (backup DB, rotação de master key, restore) → verify: doc revisada.
