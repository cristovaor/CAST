# 07 — Model Registry and Artifacts V6

## Objetivo

Definir como registrar modelos V6 treinados e servidos no CAST Pro.

## Problema no notebook

O notebook salva modelos como:

```python
model.save(f"modelo_{n}.tf")
```

Isso é insuficiente porque não registra:

- microação;
- fold;
- dataset;
- features;
- threshold;
- preprocessing;
- métricas;
- data;
- hiperparâmetros;
- código usado.

## Estrutura recomendada

```text
artifacts/
  models/
    cast-lstm-v6/
      OF/
        v6.0.0/
          fold_video_1/
            model.keras
            manifest.json
            metrics.json
            feature_columns.json
            class_weights.json
            training_config.yaml
            training_history.json
            confusion_matrix.json
          fold_video_2/
          ...
      OC/
      ML/
      VR/
```

## Manifesto do modelo

```json
{
  "model_id": "cast-lstm-v6-of",
  "version": "v6.0.0",
  "action": "OF",
  "fold_id": "video_1",
  "status": "candidate",
  "created_at": "2026-06-13T19:00:00Z",
  "framework": {
    "name": "tensorflow",
    "serialization": "keras"
  },
  "architecture": {
    "type": "lstm",
    "layers": [
      {"type": "TimeDistributedDense", "units": 64, "activation": "relu"},
      {"type": "LSTM", "units": 64, "return_sequences": true, "activation": "relu"},
      {"type": "LSTM", "units": 32, "return_sequences": true, "activation": "relu"},
      {"type": "LSTM", "units": 16, "return_sequences": false, "activation": "relu"},
      {"type": "Dense", "units": 2, "activation": "softmax"}
    ]
  },
  "input": {
    "window_size": 7,
    "input_shape": [7, 64],
    "label_policy": "next_frame_after_window",
    "feature_columns_path": "feature_columns.json"
  },
  "output": {
    "classes": ["NEUTRO", "OLHO_FECHADO"],
    "threshold": 0.5
  },
  "training": {
    "dataset_id": "dataset_cast_v6_001",
    "split_strategy": "leave_one_video_out",
    "epochs": 40,
    "batch_size": 34,
    "learning_rate": 0.00010548643264689491,
    "optimizer": "Adam",
    "loss": "CategoricalCrossentropy",
    "early_stopping_patience": 5
  },
  "preprocessing": {
    "normalization": "landmarks_already_normalized_by_region",
    "scaler": null,
    "pca": null
  }
}
```

## Status de modelo

| Status | Uso |
|---|---|
| `draft` | gerado, ainda não avaliado |
| `candidate` | avaliado, aguardando aprovação |
| `active` | pode ser servido pela API |
| `archived` | removido do serving |
| `rejected` | falhou nos critérios |

## Estratégia de ensemble

Como o notebook treina 9 folds, há duas estratégias possíveis:

### 1. Modelo por fold

Usar para avaliação científica.

```text
fold_video_1/model.keras
fold_video_2/model.keras
...
```

### 2. Modelo final consolidado

Treinar em todos os vídeos aprovados após validação e promover:

```text
final/model.keras
```

Recomendação:

- usar folds para avaliação;
- treinar modelo final para serving;
- registrar ambos.

## Banco de dados

Tabela sugerida:

```sql
CREATE TABLE model_versions (
    id UUID PRIMARY KEY,
    model_id TEXT NOT NULL,
    version TEXT NOT NULL,
    action TEXT NOT NULL,
    status TEXT NOT NULL,
    artifact_uri TEXT NOT NULL,
    manifest JSONB NOT NULL,
    metrics JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    activated_at TIMESTAMPTZ,
    UNIQUE(model_id, version, action)
);
```

## Promoção

Endpoint interno:

```http
POST /api/v1/models/{model_id}/versions/{version}/promote
```

Payload:

```json
{
  "status": "active",
  "reason": "Meets minimum evaluation criteria for OF model.",
  "approved_by": "user_id"
}
```

## Auditoria

Toda promoção ou troca de modelo ativo deve gerar log:

```json
{
  "event_type": "MODEL_VERSION_PROMOTED",
  "model_id": "cast-lstm-v6-of",
  "version": "v6.0.0",
  "previous_version": "v5.0.0",
  "approved_by": "user_id",
  "timestamp": "2026-06-13T19:00:00Z"
}
```

## Critérios de aceite

- Nenhum modelo ativo sem manifesto.
- Nenhum modelo ativo sem feature order.
- Nenhum modelo ativo sem métricas.
- Nenhum modelo ativo sem dataset_id.
- Nenhum modelo ativo sem status de aprovação.
- API sempre retorna model_version usado na predição.
