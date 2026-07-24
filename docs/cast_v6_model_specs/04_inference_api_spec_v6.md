# 04 — Inference API Spec V6

## Objetivo

Definir como o modelo LSTM V6 será servido via API no backend Python/FastAPI do CAST Pro.

## Princípio

A API não deve receber vídeo bruto diretamente no endpoint de inferência do modelo. O fluxo correto é:

```text
video upload -> extract landmarks -> normalize -> create windows -> model inference -> postprocess events -> persist results
```

A API de inferência pode operar em dois modos:

| Modo | Entrada | Uso |
|---|---|---|
| Batch por vídeo | `video_id` já processado em landmarks | Produção |
| Direto por landmarks | array de features | Testes, debug, validação |

## Endpoints

### 1. Listar modelos disponíveis

```http
GET /api/v1/models
```

Resposta:

```json
{
  "items": [
    {
      "model_id": "cast-lstm-v6-of",
      "version": "v6.0.0",
      "action": "OF",
      "status": "active",
      "input_shape": [7, 64],
      "output_classes": ["NEUTRO", "OLHO_FECHADO"],
      "label_policy": "next_frame_after_window"
    }
  ]
}
```

### 2. Obter manifesto do modelo

```http
GET /api/v1/models/{model_id}/manifest
```

Resposta:

```json
{
  "model_id": "cast-lstm-v6-of",
  "version": "v6.0.0",
  "action": "OF",
  "framework": "tensorflow",
  "input_shape": [7, 64],
  "feature_columns": ["33_X", "33_Y", "7_X", "7_Y"],
  "coordinates": ["X", "Y"],
  "window_size": 7,
  "label_policy": "next_frame_after_window",
  "preprocessing": {
    "type": "raw_normalized_landmarks",
    "scaler": null,
    "pca": null
  },
  "threshold": 0.5
}
```

### 3. Inferência batch por vídeo

```http
POST /api/v1/videos/{video_id}/infer
```

Payload:

```json
{
  "model_version": "cast-lstm-v6-of:v6.0.0",
  "actions": ["OF", "OC", "ML", "VR"],
  "postprocess": {
    "collapse_consecutive": true,
    "min_run_length": 3,
    "return_frame_predictions": true,
    "return_events": true
  }
}
```

Resposta:

```json
{
  "job_id": "job_01HZV6",
  "video_id": "video_123",
  "status": "queued",
  "created_at": "2026-06-13T19:00:00Z"
}
```

### 4. Status do job

```http
GET /api/v1/inference-jobs/{job_id}
```

Resposta:

```json
{
  "job_id": "job_01HZV6",
  "status": "completed",
  "progress": 100,
  "stage": "postprocess_events",
  "video_id": "video_123",
  "model_versions": ["cast-lstm-v6-of:v6.0.0"],
  "started_at": "2026-06-13T19:00:01Z",
  "finished_at": "2026-06-13T19:02:12Z"
}
```

### 5. Resultado de inferência

```http
GET /api/v1/videos/{video_id}/predictions?model_version=cast-lstm-v6-of:v6.0.0
```

Resposta:

```json
{
  "video_id": "video_123",
  "model_version": "cast-lstm-v6-of:v6.0.0",
  "fps": 30.0,
  "window_size": 7,
  "label_policy": "next_frame_after_window",
  "actions": {
    "OF": {
      "summary": {
        "total_positive_frames": 315,
        "total_events": 42,
        "events_per_minute": 13.7,
        "mean_confidence": 0.82
      },
      "events": [
        {
          "event_id": "evt_001",
          "action": "OF",
          "start_frame": 120,
          "end_frame": 135,
          "start_time_ms": 4000,
          "end_time_ms": 4500,
          "duration_ms": 500,
          "confidence_mean": 0.82,
          "confidence_max": 0.94,
          "source": "model"
        }
      ]
    }
  }
}
```

### 6. Inferência direta por landmarks

Uso restrito a debug.

```http
POST /api/v1/models/{model_id}/predict
```

Payload:

```json
{
  "instances": [
    {
      "frames": [
        {"frame": 0, "features": {"33_X": 0.12, "33_Y": 0.55}},
        {"frame": 1, "features": {"33_X": 0.13, "33_Y": 0.56}}
      ]
    }
  ]
}
```

Resposta:

```json
{
  "model_id": "cast-lstm-v6-of",
  "predictions": [
    {
      "window_start_frame": 0,
      "label_frame": 7,
      "probabilities": {
        "NEUTRO": 0.18,
        "OLHO_FECHADO": 0.82
      },
      "predicted_class": "OLHO_FECHADO",
      "confidence": 0.82
    }
  ]
}
```

## Contrato de saída frame-level

Cada janela deve gerar:

| Campo | Tipo | Descrição |
|---|---|---|
| `window_start_frame` | int | Primeiro frame da janela |
| `window_end_frame` | int | Último frame usado na janela |
| `label_frame` | int | Frame ao qual a predição será associada |
| `action` | string | Microação |
| `prob_neutral` | float | Probabilidade classe 0 |
| `prob_action` | float | Probabilidade classe 1 |
| `predicted_label` | int | `0` ou `1` |
| `confidence` | float | Maior probabilidade |
| `model_version` | string | Versão |
| `fold_id` | string/null | Fold usado, se aplicável |

## Regras de threshold

Default:

```text
predicted_label = 1 se prob_action >= 0.5
```

Mas o threshold deve ser versionado:

```json
{
  "threshold_policy": {
    "type": "fixed",
    "value": 0.5
  }
}
```

Para produção, permitir threshold por ação:

```json
{
  "OF": 0.50,
  "OC": 0.55,
  "ML": 0.60,
  "VR": 0.55
}
```

## Erros

### Feature incompatível

```json
{
  "error": "FEATURE_SCHEMA_MISMATCH",
  "message": "Input features do not match model manifest.",
  "expected_features": 64,
  "received_features": 62
}
```

### Vídeo sem landmarks

```json
{
  "error": "LANDMARKS_NOT_READY",
  "message": "Video landmarks must be extracted before inference."
}
```

### Modelo indisponível

```json
{
  "error": "MODEL_NOT_AVAILABLE",
  "message": "Requested model version is not active or not loaded."
}
```

## Carregamento do modelo

O serviço de inferência deve usar cache em memória:

```text
ModelRegistry -> load model manifest -> load TensorFlow model -> validate input shape -> cache
```

Chave de cache:

```text
{model_id}:{version}:{action}
```

## Observabilidade

Logar por inferência:

- `request_id`;
- `video_id`;
- `model_version`;
- `action`;
- `n_frames`;
- `n_windows`;
- `latency_ms`;
- `device`;
- `status`;
- `error_code`.

## Segurança

- Não expor paths internos.
- Não retornar stacktrace ao cliente.
- Bloquear inferência direta por landmarks para perfis não técnicos.
- Registrar auditoria de uso do modelo.
- Associar resultado ao consentimento do participante.
