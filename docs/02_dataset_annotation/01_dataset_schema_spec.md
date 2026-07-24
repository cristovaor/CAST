# Fase 2 — Especificação do Dataset

## 1. Objetivo

Padronizar o formato dos dados brutos, derivados, anotados e exportados para reprodutibilidade.

## 2. Estrutura de diretórios

```text
datasets/
  cast_v1/
    metadata/
      studies.csv
      participants.csv
      sessions.csv
      lessons.csv
    raw_videos/
      P001_S001.mp4
    landmarks/
      P001_S001_facemesh.parquet
    annotations/
      P001_S001_annotations.csv
    predictions/
      P001_S001_predictions_cast_lstm_v1.parquet
    reports/
      P001_S001_report.json
    dataset_card.md
```

## 3. Schema de `sessions.csv`

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| session_id | uuid | sim | sessão de gravação |
| study_id | uuid | sim | estudo |
| participant_id | uuid | sim | participante pseudonimizado |
| lesson_id | uuid | sim | aula/material |
| started_at | timestamp | sim | início |
| duration_seconds | float | sim | duração |
| pre_test_score | float | não | nota antes |
| post_test_score | float | não | nota depois |
| learning_gain | float | não | post - pre |
| lesson_type | enum | não | R/NR/outro |

## 4. Schema de landmarks

Formato recomendado: Parquet.

| Campo | Tipo | Descrição |
|---|---|---|
| frame_index | int | índice do frame |
| timestamp_ms | int | tempo no vídeo |
| face_detected | bool | face detectada |
| landmark_id | int | índice MediaPipe |
| x | float | coordenada original normalizada do MediaPipe |
| y | float | coordenada original normalizada do MediaPipe |
| z | float | coordenada original, armazenável mas não usada no modelo original |
| region | string | olho, íris, boca etc. |
| x_region_norm | float | normalização por região |
| y_region_norm | float | normalização por região |
| extraction_model | string | versão do FaceMesh |

## 5. Schema de anotação frame-level

```csv
frame_index,timestamp_ms,NEUTRO,OF,OC,ML,VR,annotator_id,annotation_version,notes
1,33,0,1,0,0,0,A01,v1,
2,66,0,1,0,0,0,A01,v1,
```

Regras:

- Valores binários por microação.
- Pode haver múltiplas microações simultâneas.
- `NEUTRO=1` somente se OF=OC=ML=VR=0.
- Não usar `NEUTRO=1` junto com microação positiva.

## 6. Schema de evento anotado

```csv
event_id,session_id,action,start_frame,end_frame,start_ms,end_ms,annotator_id,confidence,notes
uuid,S001,OF,120,135,4000,4500,A01,0.90,"blink sequence"
```

## 7. Schema de predição

```parquet
session_id
video_id
model_version
frame_index
timestamp_ms
action
probability_positive
predicted_label
threshold
```

## 8. Dataset card mínimo

Todo dataset versionado deve conter:

- objetivo;
- origem dos dados;
- quantidade de participantes;
- quantidade de vídeos;
- distribuição por grupo;
- critérios de exclusão;
- protocolo de coleta;
- protocolo de anotação;
- versão do consentimento;
- riscos de viés;
- limitações conhecidas;
- licença/restrição de uso.

## 9. Versionamento

Formato:

```text
dataset_version = cast-{major}.{minor}.{patch}
```

Mudanças major:

- novo protocolo de coleta;
- nova definição de microação;
- alteração no schema de anotação;
- inclusão de dados de outra população.

Mudanças minor:

- novos vídeos sob mesmo protocolo;
- correção de anotações.

Mudanças patch:

- correção de metadados sem alterar labels.
