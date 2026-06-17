# Spec — FleetWatch: Monitoramento Ativo de Home Assistant / Frigate

> Feature: `001-fleet-monitor` · Status: draft pronto para plan · Owner: arquitetura
> Fonte de verdade funcional. Toda implementação deriva daqui.

## 1. Objetivos
- Monitorar ativamente uma frota de servidores rodando Home Assistant + Frigate NVR (Ubuntu Linux e HAOS).
- Detectar e alertar sobre: indisponibilidade, falha do Frigate, armazenamento de rede desconectado (HAOS), anomalias de gravação por câmera, disco cheio, e câmeras sem imagem na UI do Frigate.
- Centralizar saúde da frota em um dashboard único, com histórico e timeline de eventos.
- Notificar via Telegram e/ou WhatsApp respeitando severidade, dedupe e cooldown.

## 2. Não Objetivos
- NÃO gerenciar/configurar o Frigate ou Home Assistant (sem escrita/restart/deploy nos servidores).
- NÃO substituir o NVR nem armazenar vídeo/clip; apenas lê metadados de gravação.
- NÃO ser plataforma de automação residencial.
- NÃO fazer descoberta automática de servidores na rede (cadastro é manual) — v1.
- NÃO multi-tenant SaaS (instância única, multiusuário) — v1.

## 3. Personas
- **Operador de NVR (Castro)** — responsável por garantir que CFTV grava 24/7. Quer alerta imediato quando câmera cai ou disco enche. Persona primária.
- **Administrador de infra** — cadastra servidores, gerencia credenciais e papéis, define políticas de notificação.
- **Visualizador (gestor)** — só consulta dashboards e relatórios; sem permissão de mutação.

## 4. User Stories
- **US1** — Como admin, cadastro um servidor informando tipo (Ubuntu/HAOS), host, portas, credenciais e endpoints, para que ele entre no monitoramento.
- **US2** — Como admin, agrupo servidores (ex.: por site/obra) para organizar o dashboard.
- **US3** — Como operador, vejo numa tela o status verde/amarelo/vermelho de cada servidor e a causa quando não está verde.
- **US4** — Como operador, recebo no Telegram/WhatsApp um alerta quando a conectividade cai, o Frigate para, um disco passa do limite, um storage de rede desconecta, ou uma câmera fica sem imagem.
- **US5** — Como operador, vejo por servidor a tabela de câmeras com dias de retenção, espaço por câmera e espaço total das gravações.
- **US6** — Como operador, vejo gráfico de uso de disco (SSD/HD) por servidor ao longo do tempo.
- **US7** — Como admin, configuro por servidor o intervalo de checagem, canais de notificação e severidade mínima.
- **US8** — Como operador, consulto o histórico de checks (stdout/stderr/exit code/timestamp) de cada servidor para diagnóstico.
- **US9** — Como admin, defino quem é admin/operator/viewer e auditei quem alterou o quê.
- **US10** — Como operador, vejo uma timeline de eventos (abriu/fechou alerta, recuperação) por servidor e global.

## 5. Requisitos Funcionais

### RF-Cadastro
- **RF-01** CRUD de servidores: criar, listar, editar, remover.
- **RF-02** Agrupamento de servidores (grupos nomeados; servidor pertence a 0..1 grupo em v1).
- **RF-03** Campos por servidor: nome; tipo (`ubuntu` | `haos`); host/IP; porta SSH; porta HA; porta Frigate; credencial SSH (chave ou senha, quando aplicável); HA base URL + token; Frigate base URL; intervalo de checagem; canais ativos (telegram/whatsapp/ambos); severidade mínima para alertar; habilitado/desabilitado.
- **RF-04** Validação Zod de todos os campos; teste de conexão opcional ao salvar (ping/SSH/HA/Frigate) com resultado exibido, sem persistir segredo em claro.

### RF-Checks (monitoramento ativo, por intervalo configurado)
- **RF-10 Conectividade** — verificar alcance do servidor (TCP connect na porta relevante; ICMP opcional). Resultado: up/down + latência.
- **RF-11 Frigate status (Ubuntu)** — via SSH executar `/usr/local/sbin/frigate-status.sh`; capturar **stdout, stderr, exit code, timestamp**; interpretar OK/warning/critical a partir de exit code e/ou marcadores no output (ver RN-Severidade e Premissa A1).
- **RF-12 Frigate status (HAOS)** — solução equivalente SEM depender do script shell: derivar estado do Frigate a partir das APIs (HA Supervisor add-on state + Frigate `/api/stats` e `/api/version`). Ver `plan.md` §Estratégia HAOS.
- **RF-13 Storage de rede (HAOS)** — via API do Home Assistant verificar se os mounts de rede (ex.: `HD_Externo`, `frigate`) estão conectados; sinalizar desconexão (cenário do screenshot 2). Ver Premissa A2.
- **RF-14 Gravações Frigate** — via Frigate API coletar por câmera: espaço em disco, % do total, bandwidth, dias/retenção disponíveis, e totais (recordings usado/total). Ver Premissa A3.
- **RF-15 Disco (df)** — via SSH (Ubuntu) e via API/sensor (HAOS) coletar total/livre/usado e % de cada HD/SSD montado relevante (ex.: `/mnt/frigate-ssd`, `/mnt/hdexterno`).
- **RF-16 UI do Frigate / câmeras com imagem** — confirmar que todas as câmeras exibem imagem. Estratégia primária via API (Frigate `/api/stats` → `camera_fps`/`detection_fps` > 0 e timestamps recentes); estratégia secundária opcional via snapshot/latest endpoint. Ver `plan.md` §Checagem visual. Sinalizar câmera "sem imagem"/stale.

### RF-Eventos & Estado
- **RF-20** Cada execução de check gera um `CheckRun` persistido com resultado bruto (redatado) e severidade derivada.
- **RF-21** Transições de severidade abrem/atualizam/fecham um `Event` (alerta). Recuperação gera evento de "resolved".
- **RF-22** Timeline de eventos consultável por servidor e global, com filtros por severidade/intervalo.

### RF-Notificações (implementar por ÚLTIMO — Constitution P6/C3)
- **RF-30** Telegram via Bot API (`sendMessage`).
- **RF-31** WhatsApp via provedor configurável: Evolution API, Twilio, ou Meta Cloud API (adaptador selecionável).
- **RF-32** Templates de mensagem por severidade (info/warning/critical/resolved) e por tipo de check.
- **RF-33** Dedupe (não reenviar o mesmo alerta aberto), cooldown configurável, retry com backoff, e histórico de envio (sucesso/falha/tentativas).
- **RF-34** Respeitar canais ativos e severidade mínima por servidor.

### RF-Dashboard & Páginas
- **RF-40** Visão geral de saúde da frota (contadores por severidade, grid de servidores).
- **RF-41** Card por servidor (status, último check, resumo de discos/câmeras).
- **RF-42** Tabela de câmeras por servidor.
- **RF-43** Gráficos de uso de disco (Recharts) com histórico.
- **RF-44** Timeline de eventos.
- **RF-45** Página de configurações (servidor, grupos, notificação, usuários/RBAC).
- **RF-46** Página de logs/checks (consulta de `CheckRun` com stdout/stderr/exit/timestamp).

### RF-Segurança & Plataforma
- **RF-50** Autenticação de usuários + RBAC (admin/operator/viewer).
- **RF-51** Criptografia de segredos em repouso; redaction em logs.
- **RF-52** Log de auditoria de ações mutáveis.
- **RF-53** Healthcheck da app (`/api/health`).

## 6. Requisitos Não Funcionais
- **RNF-01 Escala** — suportar ≥ 50 servidores e ≥ 1000 câmeras agregadas sem degradar UI (paginação/virtualização).
- **RNF-02 Isolamento** — falha/timeout de um servidor não afeta os demais (Constitution P5).
- **RNF-03 Timeout** — por tipo de check (ex.: conectividade 5s, SSH 15s, API HTTP 10s; configuráveis).
- **RNF-04 Resiliência** — retries controlados com backoff; jobs idempotentes.
- **RNF-05 Latência UI** — primeira pintura útil do dashboard < 2s em frota de 50 servidores (dados em cache).
- **RNF-06 Segurança** — segredos cifrados; sem vazamento em logs/erros; rate limiting em auth/mutação.
- **RNF-07 Observabilidade** — logs JSON com correlationId; métricas de check/fila/notificação.
- **RNF-08 Portabilidade** — Docker Compose para dev; PostgreSQL como único datastore.

## 7. Regras de Negócio

### RN-Severidade (estados)
Estados canônicos: **OK (info)**, **WARNING**, **CRITICAL**, **UNKNOWN** (check não pôde executar/timeout), **RESOLVED** (transição de WARNING/CRITICAL → OK).

Mapeamento por check (padrões seguros; thresholds configuráveis por servidor/sistema):
- **Conectividade**: inalcançável → CRITICAL; alta latência (> limite) → WARNING.
- **Frigate status (Ubuntu)**: exit code `0` → OK; exit `1` → WARNING (alertas presentes, ex.: "espaço baixo" do screenshot 1); exit ≥ `2` ou falha SSH → CRITICAL. Marcadores de texto "Alerta:" elevam para ao menos WARNING. (Premissa A1)
- **Frigate status (HAOS)**: add-on não "started" → CRITICAL; `/api/stats` inacessível → CRITICAL; processo up mas câmera/detector degradado → WARNING.
- **Storage de rede (HAOS)**: mount esperado ausente/desconectado → CRITICAL; degradado → WARNING.
- **Gravações Frigate**: dias de retenção < mínimo esperado → WARNING; sem gravação recente / câmera ausente nos stats → CRITICAL.
- **Disco**: uso ≥ `threshold_emergencia` (padrão 95%) → CRITICAL; livre < `min_livre` (padrão 15%) → WARNING. (alinha com config do screenshot 1)
- **Câmera sem imagem**: fps 0 ou frame stale além de N intervalos → CRITICAL (CFTV cego é crítico).

Severidade do servidor = máxima severidade entre seus checks no ciclo.

### RN-Alerta
- **RN-01** Alerta só dispara se severidade ≥ severidade mínima configurada do servidor.
- **RN-02** Um alerta aberto não é reenviado enquanto não houver mudança de estado (dedupe por chave `serverId+checkType+dimensão`).
- **RN-03** Cooldown configurável entre reenvios do mesmo alerta persistente (padrão 60 min).
- **RN-04** Recuperação (→ OK) fecha o alerta e envia notificação RESOLVED uma única vez.
- **RN-05** UNKNOWN repetido por ≥ N ciclos escala para WARNING/CRITICAL (configurável).

### RN-Agendamento
- **RN-10** Cada servidor agenda seus checks no seu `intervalo`. Servidor desabilitado não agenda.
- **RN-11** Não sobrepor execuções do mesmo servidor (lock por servidor); se o ciclo anterior não terminou, pular e registrar.

## 8. Critérios de Aceite (Gherkin resumido)
- **CA-01** Dado servidor Ubuntu cadastrado, quando o ciclo roda, então `frigate-status.sh` é executado via SSH e o `CheckRun` contém stdout, stderr, exit code e timestamp.
- **CA-02** Dado disco do screenshot (SSD 76%, HD 86% com "espaço baixo"), quando avaliado contra thresholds padrão, então gera WARNING e notifica os canais ativos respeitando dedupe.
- **CA-03** Dado HAOS com mount `frigate`/`HD_Externo` desconectado (screenshot 2), quando o check de storage roda, então severidade = CRITICAL e alerta é aberto.
- **CA-04** Dado Frigate com 8 câmeras, quando uma câmera reporta fps 0 / frame stale (screenshot 4), então check de câmera = CRITICAL e a tabela de câmeras marca a câmera afetada.
- **CA-05** Dado um alerta CRITICAL já aberto, quando o próximo ciclo confirma o mesmo estado dentro do cooldown, então NÃO há reenvio (dedupe).
- **CA-06** Dado o servidor volta ao normal, quando o check resulta OK, então um único RESOLVED é enviado e o alerta fecha.
- **CA-07** Dado um viewer, quando tenta editar um servidor, então a ação é negada (RBAC) e registrada em auditoria como tentativa.
- **CA-08** Dado qualquer log/erro emitido, quando inspecionado, então nenhum token/senha/chave aparece (redaction).
- **CA-09** Dado timeout em um servidor, quando o ciclo roda, então os demais servidores são checados normalmente (isolamento) e o servidor afetado fica UNKNOWN.
- **CA-10** Dado `/api/health`, quando chamado, então retorna status de DB, fila e worker.

## 9. Premissas (resolvidas)
- **A1 — RESOLVIDA** ✅ `frigate-status.sh` (lido em `scripts/frigate-status.sh`) tem exit code **semântico**: `0`=OK, `1`=alerta, `2`=crítico (cabeçalho L19-23; `run_check` L492-535). Modos relevantes: `--json` (métricas estruturadas limpas, sem ANSI: ssd/hd usage_percent, total, available, recording_days, clips/exports/snapshots, frigate.status, config) e `--check` (linhas `OK:`/`WARNING:`/`CRITICAL:` + exit code). Thresholds `WARN=75`/`CRIT=90` vêm do `.env`. Confere com screenshot 1 (SSD 76% + HD 86% → exit 1). **Caveat de parsing:** em `--json`, disco ausente interpola `usage_percent: -` → JSON inválido; parser precisa tolerar e tratar como CRITICAL "disco não encontrado". HD desmontado → `mounted:false` → CRITICAL.
- **A2 — RESOLVIDA** ✅ (HAOS) Supervisor REST API confirmada: `GET /mounts` retorna lista de mounts com campo `state` (`"active"` = conectado; outro = problema) — cenário screenshot 2; `GET /host/info` → disk_total/used/free; `GET /addons/<slug>/info` → `state` (`"started"`/`"stopped"`); `GET /info` ping. Auth `Bearer <SUPERVISOR_TOKEN>`. **Acesso externo:** Supervisor token ≠ long-lived token; ver estratégia HAOS no plan (proxy `/api/hassio/` ou fallback `/api/states`). Fonte: https://developers.home-assistant.io/docs/api/supervisor/endpoints
- **A3 — RESOLVIDA** ✅ Versão **única 0.17.1** para toda a frota. Métricas de gravação via Frigate `/api/version`, `/api/stats` (per-camera `camera_fps`/`detection_fps`/`process_fps`/`skipped_fps`; `service.storage.<path>{total,used,free}`; `service.uptime`/`version`), `/api/config` (lista de câmeras + retenção). Endpoint exato de storage por câmera (screenshot 3) validado em runtime contra a instância na task T041.
- **A4** Acesso de rede da app aos servidores (SSH e HTTP das APIs) existe ou via VPN/túnel. Cadastro é manual.
- **A5** Instância única multiusuário (não SaaS multi-tenant) em v1.
