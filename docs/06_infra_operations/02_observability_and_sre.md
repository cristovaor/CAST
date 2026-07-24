# Fase 6 — Observabilidade e SRE

## 1. Objetivo

Detectar falhas de API, fila, processamento de vídeo, qualidade do dataset e degradação de modelo.

## 2. Métricas de API

- request_count;
- request_latency_p95;
- error_rate;
- auth_failures;
- upload_url_created_total.

## 3. Métricas de job

- jobs_pending;
- jobs_running;
- jobs_failed_total;
- job_duration_seconds por etapa;
- frames_processed_total;
- facemesh_failure_rate;
- inference_duration_seconds.

## 4. Métricas de qualidade de vídeo

- face_detected_rate;
- no_face_gap_max_seconds;
- blur_score;
- brightness_mean/std;
- rejected_videos_total.

## 5. Métricas de modelo

- confidence_mean por ação;
- eventos por minuto;
- distribuição de probabilidades;
- drift de landmarks;
- diferença humano vs modelo.

## 6. Logs estruturados

Campos mínimos:

```json
{
  "timestamp": "...",
  "level": "INFO",
  "service": "worker",
  "trace_id": "uuid",
  "job_id": "uuid",
  "video_id": "uuid",
  "step": "FACEMESH",
  "message": "processed frames",
  "metrics": {}
}
```

## 7. Alertas

| Alerta | Threshold |
|---|---:|
| API 5xx | > 2% em 10 min |
| Job failure | > 5% em 1h |
| Queue backlog | > 100 jobs |
| FaceMesh failure | > 20% dos frames em vídeos aceitos |
| Storage error | qualquer erro persistente |

## 8. Dashboards

- API overview.
- Worker throughput.
- Video quality.
- Model monitoring.
- Data governance/audit.

## 9. Critério de aceite

- [ ] trace_id cruza API e worker;
- [ ] métricas por etapa;
- [ ] alertas no staging;
- [ ] dashboard de qualidade de vídeo;
- [ ] logs sem dados sensíveis.
