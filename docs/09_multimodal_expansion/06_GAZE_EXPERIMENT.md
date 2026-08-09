# 06 — Experimento de gaze

## Objetivo
Produzir gaze calibrado como resultado experimental separado de proxies olho/cabeça, sob `GAZE_EXPERIMENT_ENABLED`.

## Dependências
FACE + ACQ + CTX, contratos temporais, contexto de tela/estímulo e migração `023`.

## Não objetivos
Eye tracker clínico, atenção, coordenadas sem calibração aprovada ou import de implementações face/contexto.

## Backend
Entidades próprias. APIs `/sessions/{id}/gaze-calibrations`, `/gaze-calibrations/{id}/samples/batch`, `/complete` e `/sessions/{id}/gaze-series`, separando raw/filtered/model-output.

## Frontend
Calibração fullscreen 3×3 aleatória, duas repetições, 500 ms de estabilização, 1,5 s de coleta, cinco pontos só de validação e drift final. Mapa de erro, qualidade, X/Y, AOIs e heatmap com badge experimental.

## Worker/agente
Consome contratos de iris offset, geometria e pose; ridge polinomial por participante; persiste `iris_offset_proxy` e `calibrated_screen_gaze` separados; filtra após raw. Fixações/sacadas/AOIs só após gate.

## Contratos
Parâmetros, splits, erro angular/pixel, tracking loss, estabilidade, drift, pose strata e provenance.

## Experimento
Pontos conhecidos e subamostra com eye tracker; splits por participante, câmeras, iluminação, óculos e drift.

## Testes
Ordem/tempos, idempotência, separação treino/validação, qualidade, leakage e supressão após falha.

## Critérios de aceite
GO ROI grosseira: mediana ≤3°, P95 ≤6°, válidas ≥85%, balanced accuracy AOI ≥0,80. Entre 3°–5°: exploratório. Acima de 5° ou válidas <70%: remover coordenadas e conservar proxies.

## Rollback
Desligar flag, marcar `NO_GO`, manter calibrações/proxies auditáveis sem apagar raw.

## Tarefas identificadas
`GAZE-001`, `GAZE-002`, `GAZE-003`, `GAZE-004`.

