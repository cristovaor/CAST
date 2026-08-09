# Expansão multimodal sem godnodes — índice de execução

Este arquivo é a única fonte de status do ciclo. Os planos `01`–`08` descrevem escopo e critérios, mas não mantêm estado. Uma tarefa só pode chegar a `DONE` com teste, artefato ou PR na coluna de evidência.

Estados permitidos: `BACKLOG`, `READY`, `IN_PROGRESS`, `BLOCKED`, `IN_REVIEW`, `DONE`, `NO_GO`.

## Guardrails do ciclo

- `Session` permanece agregador de identidade e associações; séries e configuração específica pertencem aos módulos de domínio.
- Novos modelos ficam fora de `app/db/models.py`; routers e tasks são adaptadores finos.
- Todos os contratos temporais usam `source_time_us`, `source_clock_id`, `canonical_time_us`, `uncertainty_us`, `quality_flags` e `valid`.
- Brutos são imutáveis no MinIO; derivados são Parquet tiled/particionado; o banco mantém catálogo, checksum, versão, proveniência, qualidade e estado.
- `RAW`, `DERIVED`, `FILTERED`, `MODEL_OUTPUT` e `ANNOTATION` não se sobrescrevem.
- Explorer agrega descritores, nunca amostras. Zustand mantém apenas relógio, janela, seleção e velocidade.
- Fora do ciclo: DECA, EMOCA, FLAME, avatar, reconstrução 3D, emoção, identificação facial, Kafka, Kubernetes e inference streaming.

## Quadro de execução

| ID | integração | camada | dependências | estado | responsável | evidência/PR |
|---|---|---|---|---|---|---|
| ARCH-001 | arquitetura | docs | — | DONE | engenharia | `docs/09_multimodal_expansion/` |
| ARCH-002 | arquitetura | contratos | ARCH-001 | DONE | backend | `src/app/schemas/time_series.py`; 8 testes aprovados |
| ARCH-003 | arquitetura | testes | ARCH-002 | DONE | engenharia | `src/tests/architecture/test_multimodal_boundaries.py` |
| ACQ-001 | captura ao vivo | banco | ARCH-002 | DONE | backend | `src/alembic/versions/019_live_capture_and_bookmarks.py`; upgrade/downgrade PostgreSQL aprovados |
| ACQ-002 | captura ao vivo | API | ACQ-001 | DONE | backend | `src/app/api/v1/routes_acquisition.py`; `src/tests/services/test_live_capture_service.py` |
| ACQ-003 | captura ao vivo | frontend | ACQ-002 | DONE | frontend | `frontend/src/features/acquisition/LiveCaptureConsole.tsx`; IndexedDB/retomada; build aprovado |
| ACQ-004 | captura ao vivo | worker | ACQ-002 | DONE | visão | `src/app/domains/acquisition/finalization.py`; SHA-256/PTS/MP4; 11 testes e migração PostgreSQL aprovados |
| FACE-001 | Face Landmarker v2 | worker | ACQ-004 | DONE | visão | modelo oficial SHA-256 fixado; VIDEO/PTS/blendshapes/matriz; smoke real de 6 frames aprovado |
| FACE-002 | Face Landmarker v2 | artefatos | FACE-001 | DONE | backend | migração `021`; Parquet/capabilities/checksums; APIs range/limit; testes aprovados |
| FACE-003 | Face Landmarker v2 | frontend | FACE-002 | DONE | frontend | overlay legado compatível + tracks/painel pose/olhos/qualidade com badge de estimativa; build aprovado |
| CTX-001 | contexto | banco/API | ARCH-002 | DONE | backend | migração `020`; trials/eventos/séries session-scoped e idempotentes; OpenAPI/testes aprovados |
| CTX-002 | contexto | SDK | CTX-001 | DONE | frontend | `packages/cast-experiment-client`; buffer offline/reconexão/flush; TypeScript aprovado |
| CTX-003 | contexto | worker | CTX-001 | DONE | dados | bruto JSONL imutável + Parquet ordenado sem luminância inventada; teste aprovado |
| CTX-004 | contexto | frontend | CTX-001, EXPLORER-003 | DONE | frontend | console de trials/eventos/importação CSV, JSON e JSONL; tracks ambientais/eventos por intervalo; Vitest/build/lint aprovados |
| EEG-001 | LSL | agente local | ARCH-002 | IN_REVIEW | EEG | agente loopback autenticado + UI/discovery/markers/XDF; falta ensaio com LabRecorder/hardware real |
| EEG-002 | LSL | banco/API | EEG-001 | DONE | backend | migração `022`; catálogo session-scoped, upload XDF e OpenAPI; testes/migração aprovados |
| EEG-003 | LSL/XDF | worker | EEG-002 | IN_REVIEW | EEG | seleção EEG, conversão e evidência de sync implementadas; falta golden XDF real no worker pyxdf |
| EEG-004 | EEG | Explorer | EEG-003, EXPLORER-001 | DONE | frontend | track EEG isolado por range/limit no manifest e Explorer |
| EXPLORER-001 | Explorer | manifest/API | ARCH-002 | DONE | backend | `src/app/api/v1/routes_explorer.py`; OpenAPI validada |
| EXPLORER-002 | Explorer | shell/rotas | EXPLORER-001 | DONE | frontend | rota canônica/redirect; `ExplorerTrackCatalog`; build aprovado |
| EXPLORER-003 | Explorer | tracks | EXPLORER-002 | DONE | frontend | séries reais por range para contexto/gaze/pupila, estado temporal e catálogo descritivo; Vitest/build/lint aprovados |
| EXPLORER-004 | Explorer | exportação | EXPLORER-002 | DONE | dados | seleção, SVG, polling do job auditável/checksum, download assinado e comparação descritiva entre sessões; OpenAPI/build aprovados |
| GAZE-001 | gaze | calibração | FACE-002, ACQ-003, CTX-001 | DONE | visão | migração `023`; MediaPipe web 0.10.35; protocolo fullscreen 3×3/2× + 5 validação + drift; build aprovado |
| GAZE-002 | gaze | processamento | GAZE-001 | DONE | visão | ridge polinomial; RAW proxy/MODEL_OUTPUT/FILTERED separados; supressão NO_GO; testes aprovados |
| GAZE-003 | gaze | Explorer | GAZE-002, EXPLORER-003 | DONE | frontend | polling de calibração, séries X/Y reais, heatmap AOI 3×3, métricas/gates e badge experimental; Vitest/build/lint aprovados |
| GAZE-004 | gaze | validação | GAZE-002 | IN_REVIEW | ciência | gates automatizados e leakage testado; falta coorte com pontos conhecidos/eye tracker |
| PUPIL-001 | pupillometria | processamento | FACE-002, CTX-003 | IN_REVIEW | visão | migração `024`; segmentação elíptica e camadas raw/normalized/corrected implementadas; falta golden de vídeo/referência |
| PUPIL-002 | pupillometria | Explorer | PUPIL-001, EXPLORER-003 | DONE | frontend | importação/processamento com polling, séries RAW/DERIVED/FILTERED reais, luminância/qualidade e ressalva RGB; Vitest/build/lint aprovados |
| PUPIL-003 | pupillometria | validação | PUPIL-001 | IN_REVIEW | ciência | MAE/ICC/validade/estratos codificados; falta referência manual/equipamento e coorte estratificada |
| VALID-001 | plataforma | engenharia | todas | DONE | QA | 181 Pytest aprovados/1 skip; 28 Vitest; build/lint; OpenAPI dos endpoints de status/range; migrações 023/024 upgrade↔downgrade aprovadas |
| VALID-002 | plataforma | ablações | FACE-002, EEG-003, GAZE-002, PUPIL-001 | IN_REVIEW | ciência | comparabilidade/split por participante testados; falta executar estudo pré-registrado |
| VALID-003 | Explorer | HCI | EXPLORER-004 | IN_REVIEW | produto | gate 15 min/h + erros + SUS codificado; falta estudo com pesquisadores |
| VALID-004 | governança | ética/LGPD | todas | IN_REVIEW | governança | flags, proveniência e export auditável implementados; falta aprovação formal de consentimento/retenção |
| VALID-005 | rollout | GO/NO-GO | VALID-001..004 | READY | comitê | decisão aguarda evidências científicas, HCI, hardware LSL/XDF e governança formal |

## Ordem e gates

`ARCH/ACQ → FACE → CTX → EEG → EXPLORER → GAZE → PUPIL → VALID`. O Explorer pode incorporar dados existentes antes de gaze e pupila. Gaze depende de FACE + ACQ + CTX; pupila depende de FACE + CTX. Os gates quantitativos e o procedimento de `NO_GO` estão em `06`, `07` e `08`.
