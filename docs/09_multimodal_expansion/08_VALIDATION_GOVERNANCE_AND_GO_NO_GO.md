# 08 — Validação, governança e GO/NO-GO

## Objetivo
Demonstrar segurança de engenharia, validade científica e utilidade do Explorer antes de liberar variáveis científicas ou ampliar rollout.

## Dependências
Todos os módulos, golden datasets, consentimento/retention/audit e comitê de pesquisa.

## Não objetivos
Tratar associação como causalidade, aprovar por demo qualitativa ou permitir `DONE` sem evidência.

## Backend
Auditar isolamento, idempotência, limites, lineage, checksums, consentimento, retenção e export pseudonimizado. Vídeo bruto só pode ser removido mantendo derivados quando política/consentimento autorizarem; derivados continuam sensíveis.

## Frontend
Status experimental/NO_GO, provenance/qualidade e bloqueio de export científico após falha; QA ao vivo fora dos resultados.

## Worker/agente
Filas `vision`, `gaze`, `pupil`, `context`, `eeg`; retry/reuse/cancelamento não sobrescrevem artefatos. Relatórios registram versões, parâmetros, exclusões e strata.

## Contratos
Flags independentes; artefatos faciais/oculares biométricos ou potencialmente biométricos; lotes idempotentes e séries no contrato temporal.

## Experimento
Pré-registro/poder. Ablação por participante: vídeo+EEG, +MediaPipe, +gaze, +pupila, +gaze+pupila, mesma tarefa/splits/hiperparâmetros; AUROC, F1, balanced accuracy, calibração e generalização. HCI mede tempo, erros, concordância, SUS, NASA-TLX. Participante nunca cruza treino/teste.

## Testes
Pytest, migrations up/down, arquitetura/imports, Compose, build/lint/Vitest/Playwright, golden datasets, VFR/face/óculos/pose, LSL, ranges, consentimento e audit.

## Critérios de aceite
Gates de `06`/`07`; Explorer ≥15 min/h sem mais erros e SUS ≥70. Comitê registra GO, exploratório ou NO_GO com evidência no índice.

## Rollback
Desligar flags, preservar brutos/lineage, retirar exports inválidos, restaurar superfícies anteriores e comunicar estudos ativos.

## Tarefas identificadas
`VALID-001`, `VALID-002`, `VALID-003`, `VALID-004`, `VALID-005`.

