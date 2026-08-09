# 04 — Contexto experimental e ambiental

## Objetivo
Representar trials, estímulos, respostas, interações e ambiente com clocks normalizados e proveniência, por CSV/JSONL, eventos ao vivo e SDK TypeScript.

## Dependências
Contratos temporais, MinIO/Parquet, idempotência, sync e migração `020`.

## Não objetivos
Inventar luminância, guardar séries em `Session`, impor protocolo único ou acoplar implementações de face/EEG.

## Backend
Módulo com `ExperimentalTrial`, `StimulusAsset`, `ExperimentalEvent` e `EnvironmentArtifact`; endpoints para trials, `/experimental-events/batch`, `/context-imports` e `/environment-series` intervaladas.

## Frontend
Importador com preview/mapeamento, editor de trials/eventos, qualidade temporal e tracks.

## Worker/agente
Valida schema/unidades, clocks e, quando calculável, materializa `stimulus_luminance(t)`, `screen_luminance(t)` e `face_illumination(t)` com método e limitações.

## Contratos
`packages/cast-experiment-client`: `startTrial`, `presentStimulus`, `recordResponse`, `recordInteraction`, `recordEnvironment`, `endTrial`, buffer, reconexão, flush, `client_event_id` e marker LSL opcional.

## Experimento
Protocolo web com eventos conhecidos e sensor opcional; comparar sequência, duplicatas, latência e recuperação offline.

## Testes
CSV/JSONL inválido, unidades, duplicata, reconexão, flush, clocks, ausência de luminância e queries intervaladas.

## Critérios de aceite
Eventos ordenáveis no tempo canônico; luminância nunca inventada; bruto preservado; derivados com método/unidade/provenance.

## Rollback
Desabilitar `EXPERIMENTAL_CONTEXT_ENABLED`, parar derivações e manter brutos exportáveis.

## Tarefas identificadas
`CTX-001`, `CTX-002`, `CTX-003`.

