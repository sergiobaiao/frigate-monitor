# Constitution — FleetWatch (Home Assistant / Frigate Fleet Monitor)

> Versão: 1.0.0 · Status: ativo · Método: Spec-Driven Development (GitHub Spec Kit)
> Este documento é a **fonte de verdade não negociável**. Spec → Plan → Tasks → Implement.
> Qualquer PR que viole um princípio MUST ser rejeitado ou justificado em `plan.md` (seção "Complexity Tracking").

---

## 1. Princípios Fundamentais

### P1 — Spec antes de código (NON-NEGOTIABLE)
Nenhuma linha de produção é escrita antes de a feature existir em `spec.md`, ter plano em `plan.md` e tarefas em `tasks.md`. Mudança de comportamento sem spec correspondente é defeito de processo, não feature.

### P2 — Segredos nunca em texto plano
Credenciais SSH, tokens do Home Assistant, chaves de provedores de notificação e senhas MUST ser criptografadas em repouso (envelope encryption) e MUST NUNCA aparecer em logs, respostas de API, mensagens de erro ou telemetria. Logs estruturados passam por redator (redaction) obrigatório.

### P3 — Read-only por padrão nos servidores monitorados
A aplicação observa; não modifica. Comandos SSH executados nos servidores monitorados MUST ser estritamente de leitura (`df`, script `frigate-status.sh`, etc.). Nenhuma operação de escrita/restart/delete sem feature explícita, aprovada e auditada.

### P4 — Tipagem e validação de fronteira
TypeScript `strict`. Toda entrada externa (API, formulários, payloads de APIs Frigate/HA, stdout de SSH) MUST ser validada com Zod antes do uso. Dados não validados não cruzam a fronteira do domínio.

### P5 — Idempotência e isolamento de falhas
Um servidor com falha NUNCA derruba o monitoramento dos demais. Cada check roda isolado, com timeout próprio, e falha de um check não cancela os outros do mesmo ciclo.

### P6 — Notificações são efeito colateral controlado
Notificação é a ÚLTIMA camada implementada e a mais defensiva: dedupe + cooldown + retry + histórico obrigatórios. Nunca enviar spam; nunca enviar segredo; nunca bloquear o ciclo de checagem aguardando entrega.

---

## 2. Arquitetura

- **AR1** — Next.js App Router como app full-stack. Lógica de domínio (checkers, scheduler, notifier) isolada em camada de serviços testável fora do framework HTTP.
- **AR2** — Camadas: `ui` → `api/actions` → `services (domain)` → `integrations (HA/Frigate/SSH/notify)` → `db`. Dependências apontam para dentro. Integrações são adaptadores plugáveis atrás de interfaces.
- **AR3** — Checkers seguem contrato comum `Checker<TInput, TResult>` com `run(ctx): Promise<CheckResult>`. Novos tipos de check se adicionam sem tocar o scheduler.
- **AR4** — Provedores de notificação (Telegram, WhatsApp/Evolution, Twilio, Meta) atrás da interface `NotificationProvider`. Trocar provedor = config, não código.
- **AR5** — Sem estado em memória como fonte de verdade. Estado de checks, eventos e dedupe vive no PostgreSQL.

## 3. Qualidade

- **Q1** — Testes obrigatórios: unitário (parsers, regras de severidade, dedupe), integração (checkers contra mocks/fixtures de HA/Frigate/SSH), e2e (fluxos críticos: cadastro de servidor, ciclo de check, disparo de alerta).
- **Q2** — Parsers de saída externa (frigate-status.sh, APIs) MUST ter fixtures versionadas, incluindo casos OK/warning/critical e malformados.
- **Q3** — Cobertura mínima de regras de negócio (severidade, dedupe, cooldown): 90%.
- **Q4** — Lint (ESLint) + format (Prettier) + typecheck verdes em CI antes de merge.
- **Q5** — Nenhuma dependência nova sem justificativa; preferir biblioteca já no stack.

## 4. Segurança

- **S1** — RBAC com papéis mínimos: `admin`, `operator`, `viewer`. Princípio do menor privilégio.
- **S2** — Auditoria imutável de toda ação mutável (criar/editar/excluir servidor, alterar config de notificação, login, troca de credencial).
- **S3** — Tratamento seguro de erros: mensagens ao usuário sem stack/segredo; detalhes só em log servidor-side redatado.
- **S4** — Credenciais SSH: preferir chave privada sobre senha; armazenadas cifradas; suporte a `known_hosts`/fingerprint para evitar MITM.
- **S5** — Rate limiting em endpoints de auth e mutação.

## 5. UX

- **UX1** — Base visual e estrutura herdadas de `next-shadcn-dashboard-starter` (shadcn/ui + Tailwind). Não reinventar componentes.
- **UX2** — Estado de saúde sempre legível em < 5s: verde/amarelo/vermelho por servidor, com causa raiz visível ao expandir.
- **UX3** — Acessibilidade: navegação por teclado, contraste AA, dark mode.
- **UX4** — Sem dado de saúde "preso" só em gráfico; todo número crítico tem representação textual.

## 6. Observabilidade

- **O1** — Logs estruturados (JSON) com `correlationId` por ciclo de check e por servidor.
- **O2** — Métricas: duração por tipo de check, taxa de falha por servidor, fila (profundidade/latência), entregas de notificação (sucesso/retry/falha).
- **O3** — Healthcheck próprio da app (`/api/health`) cobrindo DB, fila e worker.
- **O4** — Rastreamento de falhas: toda exceção em check/notify capturada, correlacionada e visível na timeline de eventos.

## 7. Regras de Contribuição

- **C1** — Branch por feature numerada (`001-...`). PR referencia spec/plan/tasks.
- **C2** — Commits convencionais. PR pequeno e revisável.
- **C3** — Ordem de implementação respeita `tasks.md`; notificações por último (P6).
- **C4** — Mudança que conflite com este documento exige atualização de versão da constitution + registro em "Complexity Tracking" do plan.
- **C5** — Documentação oficial é citada na spec/plan ao descrever comportamento de APIs externas (Home Assistant, Frigate, Telegram, WhatsApp).

## 8. Governança
Constitution supera qualquer outra prática. Emendas exigem PR dedicado, justificativa e bump de versão (semver: MAJOR = remoção/redefinição de princípio; MINOR = novo princípio; PATCH = clarificação).
