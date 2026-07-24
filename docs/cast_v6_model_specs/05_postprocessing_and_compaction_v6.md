# 05 — Postprocessing and Compaction V6

## Objetivo

Especificar a lógica de compactação/sumarização observada em `CompactadorDados.ipynb` e transformá-la em serviço de pós-processamento do CAST Pro.

## Entrada

O notebook trabalha com arquivos CSV de predição com colunas como:

```text
FRAME
ORIGINAL
PREVISAO
```

Ou, em modo multiação:

```text
FRAME
OLHO_FECHADO_PREV
OLHANDO_PARA_CANTO_PREV
...
OLHO_FECHADO_ORIGINAL
OLHANDO_PARA_CANTO_ORIGINAL
...
```

## Saída desejada

Eventos compactados:

```csv
VIDEO;FRAME;ACAO_ORIGINAL;ACAO_PREVISTA;ACAO_COLUNA
1;120;0;1;OLHO_FECHADO
1;135;1;0;OLHO_FECHADO
```

Para API, usar schema mais explícito:

```json
{
  "events": [
    {
      "video_id": "video_1",
      "action": "OF",
      "start_frame": 120,
      "end_frame": 135,
      "start_time_ms": 4000,
      "end_time_ms": 4500,
      "confidence_mean": 0.82,
      "source": "model"
    }
  ]
}
```

## Algoritmo observado no notebook

A função `criar_dataframes_mudancas` percorre cada coluna de ação e registra uma mudança quando:

1. o valor atual é diferente do valor anterior;
2. o valor anterior teve pelo menos `3` repetições;
3. a nova mudança recebe `1` se o novo valor for `1`, senão `0`.

Pseudocódigo:

```python
frames = [first_frame]
changes = [0]
previous_value = first_value
repeat_count = 1

for i in range(1, len(df)):
    if df[col][i] != previous_value:
        if repeat_count >= 3:
            change = 1 if df[col][i] == 1 else 0
            changes.append(change)
            frames.append(previous_frame)
        repeat_count = 1
    else:
        repeat_count += 1

    previous_value = df[col][i]
    previous_frame = df["FRAME"][i]
```

## Interpretação

O algoritmo tenta reduzir ruído removendo alternâncias curtas e contando apenas mudanças sustentadas por pelo menos 3 frames.

## Problemas

1. O evento é associado ao `frame_anterior`, não necessariamente ao frame real de início da nova ação.
2. A duração do evento não é calculada.
3. A confiança média do evento não é preservada.
4. A função aparece duplicada no notebook.
5. Em alguns pontos, a função mistura predição e original de forma ambígua.
6. O valor `3` está hardcoded.

## Versão recomendada para produção

### Parâmetros

```yaml
postprocessing:
  threshold: 0.5
  min_run_length: 3
  collapse_consecutive: true
  merge_gap_frames: 0
  return_negative_events: false
```

### Algoritmo recomendado

```python
def probabilities_to_events(frame_predictions, threshold=0.5, min_run_length=3):
    labels = [1 if p.prob_action >= threshold else 0 for p in frame_predictions]

    events = []
    current_start = None
    current_probs = []

    for idx, label in enumerate(labels):
        frame = frame_predictions[idx].label_frame

        if label == 1 and current_start is None:
            current_start = frame
            current_probs = [frame_predictions[idx].prob_action]

        elif label == 1:
            current_probs.append(frame_predictions[idx].prob_action)

        elif label == 0 and current_start is not None:
            end_frame = frame_predictions[idx - 1].label_frame
            duration = end_frame - current_start + 1

            if duration >= min_run_length:
                events.append({
                    "start_frame": current_start,
                    "end_frame": end_frame,
                    "confidence_mean": mean(current_probs),
                    "confidence_max": max(current_probs)
                })

            current_start = None
            current_probs = []

    return events
```

## Métricas derivadas

Para cada ação:

| Métrica | Fórmula |
|---|---|
| `total_positive_frames` | soma de frames positivos |
| `total_events` | número de eventos compactados |
| `events_per_minute` | eventos / duração em minutos |
| `mean_event_duration_ms` | média das durações |
| `mean_confidence` | média das confianças dos eventos |
| `max_confidence` | maior confiança |
| `positive_frame_rate` | frames positivos / frames válidos |

## Evolução acumulada

O notebook também calcula:

```python
merged_df["Evolucao-Or"] = merged_df["ORIGINAL"].cumsum().shift(1)
merged_df["Evolucao-Prev"] = merged_df["PREVISAO"].cumsum().shift(1)
```

No sistema, isso deve virar séries temporais para dashboard:

```json
{
  "frame": 120,
  "original_cumulative": 5,
  "predicted_cumulative": 6
}
```

## Endpoints relacionados

### Compactar predições

```http
POST /api/v1/videos/{video_id}/predictions/compact
```

Payload:

```json
{
  "model_version": "cast-lstm-v6-of:v6.0.0",
  "actions": ["OF"],
  "min_run_length": 3,
  "threshold": 0.5
}
```

### Retornar descritores

```http
GET /api/v1/videos/{video_id}/descriptors
```

Resposta:

```json
{
  "video_id": "video_1",
  "actions": {
    "OF": {
      "original_events": 67,
      "predicted_events": 68,
      "absolute_error": 1,
      "relative_error": 0.0149
    }
  }
}
```

## Critérios de aceite

- Compactação parametrizável.
- Sem valores mágicos hardcoded.
- Preserva confiança.
- Preserva início e fim do evento.
- Permite comparar predição versus anotação.
- Exporta CSV e JSON.
- Gera descritores por vídeo e por ação.
