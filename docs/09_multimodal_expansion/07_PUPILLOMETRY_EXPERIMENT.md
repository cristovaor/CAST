# 07 — Experimento de pupillometria

## Objetivo
Estimar variação pupilar relativa por webcam RGB, com luminância, qualidade e `PUPIL_EXPERIMENT_ENABLED`.

## Dependências
FACE + CTX, ROI ocular, ambiente e migração `024`.

## Não objetivos
Equivalência a pupillômetro, interpretação cognitiva, diâmetro métrico sem escala ou correção sem luminância.

## Backend
Entidades próprias e APIs `/sessions/{id}/pupil-artifacts` e `/sessions/{id}/pupil-series`, intervaladas e com camadas independentes.

## Frontend
Comparação raw/normalizada/corrigida, tracks de luminância/qualidade e aviso de que webcam RGB não equivale a pupillômetro.

## Worker/agente
Estabiliza ROI pelo contrato Face, segmenta pupila, ajusta elipse e produz diâmetro px, razão pupila/íris, baseline, velocidade, pico, tempo ao pico e AUC. Preserva raw/normalized/luminance-corrected e flags de blink, oclusão, reflexo, óculos, blur, pose e autoexposição.

## Contratos
Cada camada referencia inputs, algoritmo, parâmetros, qualidade, luminância e clock. Luminância ausente torna corrected indisponível, não zero.

## Experimento
Comparar elipses manuais/equipamento, estratificando câmera, resolução, iluminação, tom de pele, formato ocular e óculos.

## Testes
ROI instável, blink, oclusão, reflexo, autoexposição, missing luminance, camadas, retry/reuse e split por participante.

## Critérios de aceite
GO: MAE `pupil_ratio` ≤0,03, ICC(2,1) ≥0,75, válidas ≥80% e consistência nos estratos. Falha mantém auditoria/segmentação, sem variável científica exportável.

## Rollback
Desligar flag, marcar `NO_GO`, retirar corrected/exports e conservar raw/qualidade.

## Tarefas identificadas
`PUPIL-001`, `PUPIL-002`, `PUPIL-003`.

