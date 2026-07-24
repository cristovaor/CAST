# Fase 4 — Especificação do Pipeline de Processamento

## 1. Objetivo

Executar vídeos de forma assíncrona e rastreável.

## 2. Pipeline P0

```text
REGISTER_VIDEO
  ↓
QUALITY_CHECK
  ↓
EXTRACT_LANDMARKS
  ↓
NORMALIZE_REGIONS
  ↓
BUILD_WINDOWS
  ↓
RUN_INFERENCE
  ↓
COLLAPSE_EVENTS
  ↓
GENERATE_REPORT
```

## 3. Jobs

| Job | Entrada | Saída |
|---|---|---|
| quality_check | vídeo | quality_report |
| extract_landmarks | vídeo | landmarks.parquet |
| normalize_regions | landmarks | normalized_landmarks.parquet |
| inference | normalized landmarks + model | predictions.parquet |
| event_collapse | predictions | predicted_events |
| report | events + metadata | report.json/html |

## 4. Estados

```text
PENDING → RUNNING → COMPLETED
PENDING → RUNNING → FAILED
PENDING/RUNNING → CANCELLED
```

## 5. Reprocessamento

Deve ser possível reprocessar:

- com novo modelo;
- com novo threshold;
- com nova versão do pipeline;
- sem perder resultados anteriores.

## 6. Idempotência

Chave recomendada:

```text
video_id + job_type + pipeline_version + model_version + threshold_set_version
```

## 7. Artefatos

```text
raw_video.mp4
quality_report.json
landmarks_raw.parquet
landmarks_region_norm.parquet
windows.npy ou windows.parquet
predictions.parquet
predicted_events.json
session_report.json
```

## 8. Observabilidade

Cada job deve registrar:

- duração total;
- duração por etapa;
- memória máxima;
- frames processados;
- taxa de face detectada;
- erros de leitura;
- versão do código;
- versão do modelo.

## 9. Testes obrigatórios

- vídeo válido;
- vídeo com face ausente;
- vídeo curto;
- vídeo com FPS variável;
- vídeo corrompido;
- vídeo já processado;
- cancelamento de job;
- reprocessamento com novo modelo.
