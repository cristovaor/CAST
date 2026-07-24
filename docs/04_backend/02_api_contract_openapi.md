# Fase 4 — Contrato de API Backend

## 1. Objetivo

Formalizar os endpoints necessários para React, processamento assíncrono, anotação, inferência, governança e exportação.

## 2. Convenções

- Prefixo: `/api/v1`
- Formato: JSON
- Upload: URL pré-assinada preferencialmente
- Autenticação: Bearer JWT
- Idempotência: header `Idempotency-Key` em operações de criação sensíveis
- Paginação: `limit`, `offset` ou cursor
- Erros: padrão RFC 7807 simplificado

## 3. Padrão de erro

```json
{
  "type": "validation_error",
  "title": "Validation error",
  "status": 422,
  "detail": "Invalid payload",
  "instance": "/api/v1/videos",
  "errors": [
    {"field": "study_id", "message": "required"}
  ]
}
```

## 4. Endpoints P0

### Auth

| Método | Endpoint | Descrição |
|---|---|---|
| POST | `/auth/login` | login |
| POST | `/auth/refresh` | refresh token |
| GET | `/me` | usuário atual |

### Estudos

| Método | Endpoint | Descrição |
|---|---|---|
| POST | `/studies` | criar estudo |
| GET | `/studies` | listar estudos |
| GET | `/studies/{study_id}` | detalhe |
| PATCH | `/studies/{study_id}` | atualizar |

### Participantes

| Método | Endpoint | Descrição |
|---|---|---|
| POST | `/participants` | criar participante pseudonimizado |
| GET | `/participants` | listar |
| POST | `/participants/{id}/consents` | registrar consentimento |
| POST | `/participants/{id}/deletion-request` | solicitar exclusão |

### Vídeos

| Método | Endpoint | Descrição |
|---|---|---|
| POST | `/videos/upload-url` | gerar URL pré-assinada |
| POST | `/videos` | registrar vídeo após upload |
| GET | `/videos/{video_id}` | detalhe |
| POST | `/videos/{video_id}/quality-check` | iniciar validação |
| POST | `/videos/{video_id}/process` | iniciar pipeline |

### Jobs

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/jobs/{job_id}` | status |
| GET | `/jobs/{job_id}/events` | SSE de progresso |
| POST | `/jobs/{job_id}/cancel` | cancelar |

### Timeline

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/videos/{video_id}/timeline` | eventos preditos/anotados |
| GET | `/videos/{video_id}/landmarks` | landmarks agregados |
| GET | `/videos/{video_id}/quality-report` | qualidade |

### Anotação

| Método | Endpoint | Descrição |
|---|---|---|
| POST | `/annotation-tasks` | criar tarefa |
| GET | `/annotation-tasks` | listar tarefas |
| GET | `/annotation-tasks/{id}` | detalhe |
| POST | `/annotation-tasks/{id}/events` | criar evento |
| PATCH | `/annotation-events/{id}` | editar evento |
| POST | `/annotation-tasks/{id}/submit` | submeter |
| POST | `/annotation-tasks/{id}/review` | revisar |

### Exportação

| Método | Endpoint | Descrição |
|---|---|---|
| POST | `/exports` | solicitar export |
| GET | `/exports/{id}` | status |
| GET | `/exports/{id}/download-url` | URL temporária |

## 5. Payloads críticos

### Criar estudo

```json
{
  "name": "Estudo Aula Redundante vs Não Redundante",
  "description": "Validação de microações",
  "retention_days": 365,
  "consent_version": "v1.0"
}
```

### Registrar vídeo

```json
{
  "study_id": "uuid",
  "participant_id": "uuid",
  "session_id": "uuid",
  "object_key": "raw/study/video.mp4",
  "filename": "P001_S001.mp4",
  "content_type": "video/mp4"
}
```

### Timeline

```json
{
  "video_id": "uuid",
  "fps": 30,
  "duration_seconds": 182.4,
  "model_version": "cast-lstm-1.0.0",
  "source": "model|human|reviewed",
  "events": [
    {
      "event_id": "uuid",
      "action": "OF",
      "start_frame": 120,
      "end_frame": 135,
      "start_time": 4.0,
      "end_time": 4.5,
      "confidence_mean": 0.82
    }
  ]
}
```

## 6. Regras de idempotência

Operações com risco de duplicidade:

- criar estudo;
- registrar vídeo;
- criar job;
- criar exportação;
- registrar consentimento.

Usar header:

```http
Idempotency-Key: uuid
```

## 7. Eventos SSE de job

```json
{"status":"RUNNING","step":"EXTRACT_FRAMES","progress":0.25}
{"status":"RUNNING","step":"FACEMESH","progress":0.50}
{"status":"RUNNING","step":"INFERENCE","progress":0.80}
{"status":"COMPLETED","progress":1.0}
```

## 8. Critério de aceite

- [ ] OpenAPI válido.
- [ ] Todos os endpoints protegidos por auth.
- [ ] Erros padronizados.
- [ ] Jobs consultáveis.
- [ ] Timeline retorna humano/modelo/revisado.
- [ ] Exports auditáveis.
