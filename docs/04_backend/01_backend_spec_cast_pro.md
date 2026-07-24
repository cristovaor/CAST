# Especificação Técnica — Backend Python

## 1. Objetivo do sistema

Construir uma plataforma backend profissional para análise de microações faciais em vídeos de aprendizagem multimídia, substituindo o fluxo exploratório atual em Streamlit/Flask por uma arquitetura produtiva, auditável e escalável.

O sistema deve permitir:

- Cadastro de estudos, aulas, participantes e sessões de coleta.
- Upload seguro de vídeos faciais dos estudantes.
- Processamento assíncrono de vídeos.
- Extração de landmarks faciais com MediaPipe/FaceMesh ou implementação equivalente.
- Normalização dos pontos por região facial.
- Geração de janelas temporais de 7 frames.
- Inferência de classificadores de microação.
- Sumarização de ocorrências por vídeo.
- Associação dos resultados aos pré-testes, pós-testes e ganho de aprendizagem.
- Geração de relatórios, métricas, visualizações e datasets exportáveis.

O sistema **não deve vender a inferência como diagnóstico definitivo de carga cognitiva**. A versão inicial deve declarar os resultados como indicadores comportamentais correlacionais e exploratórios.

---

## 2. Diagnóstico de viabilidade

### 2.1. Viabilidade técnica

É viável construir o sistema com backend em Python e frontend em React. O maior desafio não é engenharia web; é transformar um pipeline científico de visão computacional em um produto confiável, rastreável e validável.

A dissertação já comprova um pipeline mínimo:

1. coleta de vídeos faciais;
2. extração de pontos faciais;
3. uso de regiões específicas do rosto;
4. janelas temporais de 7 quadros;
5. classificadores baseados em LSTM;
6. sumarização de ocorrências de microações;
7. associação com ganho de aprendizagem.

### 2.2. Viabilidade científica

Viável como **MVP de pesquisa aplicada**. Ainda frágil como produto preditivo comercial, porque a base original é pequena e há sensibilidade a iluminação, qualidade do vídeo, posição da câmera e variabilidade interpessoal.

### 2.3. Decisão recomendada

Construir em 3 fases:

| Fase | Objetivo | Resultado esperado |
|---|---|---|
| Fase 1 | Profissionalizar o pipeline atual | Backend assíncrono, upload, processamento, relatório básico |
| Fase 2 | Criar módulo de anotação e re-treinamento | Dataset crescente e modelo versionado |
| Fase 3 | Produto analítico | Dashboard por aula, turma, aluno e comparação de materiais |

---

## 3. Arquitetura recomendada

### 3.1. Visão macro

```text
React Frontend
   |
   | HTTPS / REST / WebSocket ou SSE
   v
FastAPI Backend
   |
   | grava metadados
   v
PostgreSQL
   |
   | agenda jobs
   v
Redis Queue / Celery / RQ / Dramatiq
   |
   | processa vídeos
   v
Workers Python + OpenCV + MediaPipe + TensorFlow/PyTorch/ONNX
   |
   | lê/grava arquivos grandes
   v
Object Storage S3 / MinIO
```

### 3.2. Componentes

| Componente | Tecnologia sugerida | Função |
|---|---|---|
| API | FastAPI | REST, autenticação, orquestração, autorização |
| Banco relacional | PostgreSQL | Estudos, usuários, jobs, métricas, resultados |
| Fila | Redis + Celery/RQ/Dramatiq | Processamento assíncrono de vídeos |
| Storage | S3/MinIO | Vídeos, frames opcionais, modelos, relatórios |
| Processamento | OpenCV, MediaPipe, NumPy, Pandas | Extração de frames e landmarks |
| Inferência | TensorFlow/Keras, PyTorch ou ONNX Runtime | Classificadores de microações |
| Observabilidade | OpenTelemetry + Prometheus/Grafana | Logs, métricas, tracing |
| Deploy | Docker + ECS/EKS/EC2 ou VPS inicialmente | Produção |

### 3.3. Monólito modular primeiro

Evite começar com microsserviços. O sistema ainda precisa estabilizar domínio, dados e modelo.

Estrutura inicial recomendada:

```text
backend/
  app/
    main.py
    api/
      v1/
        routes_auth.py
        routes_projects.py
        routes_participants.py
        routes_videos.py
        routes_jobs.py
        routes_annotations.py
        routes_models.py
        routes_reports.py
    core/
      config.py
      security.py
      logging.py
      permissions.py
    db/
      session.py
      models.py
      migrations/
    schemas/
      auth.py
      project.py
      participant.py
      video.py
      job.py
      annotation.py
      report.py
    services/
      storage_service.py
      video_service.py
      landmark_service.py
      inference_service.py
      metrics_service.py
      report_service.py
      consent_service.py
    workers/
      celery_app.py
      tasks_video.py
      tasks_inference.py
    ml/
      facemesh.py
      preprocessing.py
      windowing.py
      model_registry.py
      predictors.py
      summarization.py
    tests/
      unit/
      integration/
      e2e/
```

---

## 4. Escopo funcional

### 4.1. MVP obrigatório

1. Autenticação e autorização.
2. Cadastro de estudo/projeto.
3. Cadastro de aula/material multimídia.
4. Cadastro de participante com consentimento.
5. Upload de vídeo via URL pré-assinada.
6. Registro de pré-teste e pós-teste.
7. Processamento assíncrono do vídeo.
8. Extração de FaceMesh/landmarks.
9. Validação de qualidade do vídeo.
10. Inferência de microações.
11. Sumarização por vídeo.
12. Dashboard de resultados via API.
13. Exportação CSV/Parquet/JSON.
14. Auditoria básica de processamento.

### 4.2. Pós-MVP

1. Anotador web de microações frame-a-frame.
2. Versionamento de datasets.
3. Versionamento de modelos.
4. Re-treinamento supervisionado.
5. Comparação entre versões de modelos.
6. Relatórios PDF.
7. Multi-tenant por instituição.
8. Integração com LMS/Moodle/Canvas.
9. UMAP/t-SNE interativo.
10. Métricas longitudinalmente por turma.

---

## 5. Domínio principal

### 5.1. Entidades

```text
User
Organization
Project
Study
Lesson
Participant
ConsentTerm
Session
VideoAsset
ProcessingJob
FrameSample
LandmarkSet
Annotation
MicroActionModel
Prediction
MicroActionEvent
LearningAssessment
AnalysisReport
AuditLog
```

### 5.2. Relações principais

```text
Organization 1:N User
Organization 1:N Project
Project 1:N Study
Study 1:N Lesson
Study 1:N Participant
Participant 1:N Session
Session 1:1 VideoAsset
Session 1:N LearningAssessment
VideoAsset 1:N ProcessingJob
ProcessingJob 1:N Prediction
Prediction 1:N MicroActionEvent
MicroActionModel 1:N Prediction
Session 1:N Annotation
Session 1:N AnalysisReport
```

---

## 6. Modelo de dados mínimo

### 6.1. users

| Campo | Tipo | Observação |
|---|---|---|
| id | UUID | PK |
| email | varchar | único |
| password_hash | varchar | se auth local |
| name | varchar | nome |
| role | enum | admin, researcher, annotator, viewer |
| organization_id | UUID | FK |
| created_at | timestamp | auditoria |

### 6.2. studies

| Campo | Tipo | Observação |
|---|---|---|
| id | UUID | PK |
| project_id | UUID | FK |
| name | varchar | nome do estudo |
| description | text | objetivo |
| status | enum | draft, active, completed, archived |
| protocol_version | varchar | versão metodológica |
| created_by | UUID | FK user |

### 6.3. participants

| Campo | Tipo | Observação |
|---|---|---|
| id | UUID | PK |
| study_id | UUID | FK |
| external_code | varchar | identificador pseudonimizado |
| demographic_group | jsonb | opcional e minimizado |
| consent_status | enum | pending, accepted, revoked |
| created_at | timestamp | auditoria |

### 6.4. video_assets

| Campo | Tipo | Observação |
|---|---|---|
| id | UUID | PK |
| session_id | UUID | FK |
| storage_uri | varchar | s3://... |
| filename | varchar | nome original |
| mime_type | varchar | video/mp4 |
| size_bytes | bigint | tamanho |
| duration_seconds | numeric | duração |
| width | int | resolução |
| height | int | resolução |
| fps | numeric | fps |
| checksum_sha256 | varchar | integridade |
| status | enum | uploaded, validated, rejected, processed |

### 6.5. processing_jobs

| Campo | Tipo | Observação |
|---|---|---|
| id | UUID | PK |
| video_asset_id | UUID | FK |
| job_type | enum | validate, extract_landmarks, infer, report |
| status | enum | queued, running, succeeded, failed, canceled |
| progress | numeric | 0 a 100 |
| error_message | text | erro sanitizado |
| started_at | timestamp | início |
| finished_at | timestamp | fim |
| worker_id | varchar | rastreabilidade |

### 6.6. landmark_sets

| Campo | Tipo | Observação |
|---|---|---|
| id | UUID | PK |
| video_asset_id | UUID | FK |
| frame_index | int | índice |
| timestamp_ms | int | tempo |
| face_detected | boolean | qualidade |
| landmarks_uri | varchar | arquivo parquet/json no storage |
| quality_score | numeric | 0 a 1 |

Para escala, não grave todos os pontos de todos os frames como linhas relacionais. Use Parquet/Arrow no storage e registre apenas metadados no PostgreSQL.

### 6.7. micro_action_models

| Campo | Tipo | Observação |
|---|---|---|
| id | UUID | PK |
| name | varchar | OLHO_FECHADO, OLHANDO_CANTO etc. |
| version | varchar | semver |
| framework | varchar | keras, torch, onnx |
| artifact_uri | varchar | modelo no storage |
| input_spec | jsonb | janelas, pontos, normalização |
| metrics | jsonb | AUC, F1, precisão etc. |
| active | boolean | modelo em produção |

### 6.8. predictions

| Campo | Tipo | Observação |
|---|---|---|
| id | UUID | PK |
| video_asset_id | UUID | FK |
| model_id | UUID | FK |
| prediction_uri | varchar | série temporal completa |
| threshold | numeric | corte usado |
| summary | jsonb | contagens, duração, frequência |
| created_at | timestamp | auditoria |

### 6.9. learning_assessments

| Campo | Tipo | Observação |
|---|---|---|
| id | UUID | PK |
| session_id | UUID | FK |
| type | enum | pre_test, post_test |
| score | numeric | nota |
| max_score | numeric | escala |
| metadata | jsonb | prova, versão, conteúdo |

---

## 7. Pipeline de processamento

### 7.1. Estados do vídeo

```text
uploaded
  -> metadata_extracted
  -> quality_checked
  -> landmarks_extracted
  -> windows_generated
  -> inference_completed
  -> summarized
  -> report_ready
```

### 7.2. Etapas detalhadas

#### Etapa 1 — Upload

- O backend cria um registro `video_asset`.
- O backend gera URL pré-assinada para upload no S3/MinIO.
- O frontend envia o arquivo direto ao storage.
- O backend recebe confirmação e agenda job de validação.

#### Etapa 2 — Validação técnica

Validar:

- formato MP4/MOV/WebM;
- duração máxima configurável;
- resolução mínima;
- FPS mínimo;
- tamanho máximo;
- integridade via checksum;
- existência de face em amostra inicial.

#### Etapa 3 — Extração de frames

- Usar OpenCV/FFmpeg.
- Processar por streaming sempre que possível.
- Evitar persistir todos os frames, exceto quando necessário para anotação.
- Registrar FPS real e timestamps.

#### Etapa 4 — FaceMesh/landmarks

- Extrair pontos faciais por frame.
- Selecionar regiões: olhos, íris, sobrancelhas, boca e contorno facial.
- Gerar dataset com coordenadas 2D normalizadas.
- Descartar coordenada z no MVP, mantendo compatibilidade futura.

#### Etapa 5 — Qualidade

Calcular por vídeo:

- percentual de frames com face detectada;
- estabilidade do rosto;
- iluminação aproximada;
- oclusão;
- distância estimada da câmera;
- taxa de frames inválidos.

Critérios sugeridos para MVP:

| Métrica | Corte inicial |
|---|---:|
| frames com face detectada | >= 85% |
| FPS | >= 15 |
| resolução | >= 720p |
| duração | 30s a 15min |
| rosto visível | >= 70% da amostra |

#### Etapa 6 — Janelamento

- Entrada: sequência de landmarks normalizados.
- Janela: 7 frames consecutivos.
- Alvo/inferência: microação no último frame.
- Output: matriz `[n_windows, 7, n_features]`.

#### Etapa 7 — Inferência

- Carregar modelos ativos do registry.
- Rodar inferência por microação.
- Salvar série temporal completa.
- Aplicar threshold configurável por modelo.
- Registrar versão do modelo, hash do artefato e input_spec.

#### Etapa 8 — Sumarização

- Remover previsões consecutivas redundantes.
- Contar ocorrências por microação.
- Calcular frequência por minuto.
- Calcular duração aproximada por evento.
- Gerar descritor do vídeo.

Exemplo:

```json
{
  "micro_actions": {
    "OLHO_FECHADO": {"count": 45, "per_minute": 15.0},
    "OLHANDO_CANTO": {"count": 82, "per_minute": 27.3},
    "MEXEU_LABIOS": {"count": 3, "per_minute": 1.0},
    "VIROU_ROSTO": {"count": 1, "per_minute": 0.3}
  },
  "quality": {
    "face_detection_rate": 0.94,
    "invalid_frames": 210
  }
}
```

#### Etapa 9 — Estatística educacional

- Calcular `learning_gain = abs(post_score - pre_score)`.
- Comparar grupos R/NR quando houver grupos.
- Aplicar Wilcoxon/Mann-Whitney conforme desenho experimental.
- Calcular correlação entre microações e ganho.
- Gerar artefatos para gráficos.

---

## 8. API REST inicial

### 8.1. Autenticação

```http
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/auth/me
```

### 8.2. Projetos e estudos

```http
GET    /api/v1/projects
POST   /api/v1/projects
GET    /api/v1/projects/{project_id}
PATCH  /api/v1/projects/{project_id}
DELETE /api/v1/projects/{project_id}

GET    /api/v1/studies
POST   /api/v1/studies
GET    /api/v1/studies/{study_id}
PATCH  /api/v1/studies/{study_id}
```

### 8.3. Participantes

```http
GET    /api/v1/studies/{study_id}/participants
POST   /api/v1/studies/{study_id}/participants
GET    /api/v1/participants/{participant_id}
PATCH  /api/v1/participants/{participant_id}
POST   /api/v1/participants/{participant_id}/consent
```

### 8.4. Sessões e vídeos

```http
POST /api/v1/sessions
GET  /api/v1/sessions/{session_id}
POST /api/v1/sessions/{session_id}/assessments

POST /api/v1/videos/init-upload
POST /api/v1/videos/{video_id}/complete-upload
GET  /api/v1/videos/{video_id}
POST /api/v1/videos/{video_id}/process
GET  /api/v1/videos/{video_id}/quality
GET  /api/v1/videos/{video_id}/predictions
GET  /api/v1/videos/{video_id}/timeline
```

### 8.5. Jobs

```http
GET    /api/v1/jobs/{job_id}
GET    /api/v1/jobs/{job_id}/events
POST   /api/v1/jobs/{job_id}/cancel
POST   /api/v1/jobs/{job_id}/retry
```

Para progresso em tempo real:

```http
GET /api/v1/jobs/{job_id}/stream
```

Usar SSE no MVP. WebSocket pode ficar para colaboração/anotação.

### 8.6. Anotações

```http
GET  /api/v1/videos/{video_id}/frames?start=0&limit=100
POST /api/v1/videos/{video_id}/annotations
GET  /api/v1/videos/{video_id}/annotations
PATCH /api/v1/annotations/{annotation_id}
DELETE /api/v1/annotations/{annotation_id}
```

### 8.7. Relatórios

```http
GET  /api/v1/studies/{study_id}/dashboard
GET  /api/v1/studies/{study_id}/reports
POST /api/v1/studies/{study_id}/reports
GET  /api/v1/reports/{report_id}/download
GET  /api/v1/studies/{study_id}/exports?format=csv|json|parquet
```

---

## 9. Contratos de resposta

### 9.1. Job

```json
{
  "id": "uuid",
  "video_asset_id": "uuid",
  "job_type": "infer",
  "status": "running",
  "progress": 63.5,
  "current_step": "extracting_landmarks",
  "created_at": "2026-06-13T12:00:00Z",
  "started_at": "2026-06-13T12:01:00Z",
  "finished_at": null,
  "error_message": null
}
```

### 9.2. Resultado de vídeo

```json
{
  "video_id": "uuid",
  "session_id": "uuid",
  "duration_seconds": 180,
  "quality": {
    "face_detection_rate": 0.93,
    "quality_score": 0.81,
    "warnings": ["lighting_variation"]
  },
  "summary": {
    "OLHO_FECHADO": {"count": 45, "per_minute": 15.0},
    "OLHANDO_CANTO": {"count": 82, "per_minute": 27.3},
    "MEXEU_LABIOS": {"count": 3, "per_minute": 1.0},
    "VIROU_ROSTO": {"count": 1, "per_minute": 0.3}
  },
  "model_versions": {
    "OLHO_FECHADO": "1.0.0",
    "OLHANDO_CANTO": "1.0.0"
  }
}
```

---

## 10. Requisitos não funcionais

### 10.1. Performance

- Upload direto para object storage.
- Processamento assíncrono obrigatório.
- API não deve bloquear aguardando processamento de vídeo.
- Workers devem processar vídeos em chunks.
- Cache de resultados agregados no Redis quando necessário.

### 10.2. Escalabilidade

- API stateless.
- Workers horizontalmente escaláveis.
- Separar workers CPU e GPU quando houver volume.
- Possibilidade futura de autoscaling por tamanho da fila.

### 10.3. Segurança

- HTTPS obrigatório.
- JWT ou OIDC.
- RBAC por organização/projeto.
- URLs pré-assinadas com expiração curta.
- Criptografia em repouso no storage.
- Logs sem dados biométricos brutos.
- Auditoria de acesso a vídeos.

### 10.4. LGPD e ética

Dados faciais são altamente sensíveis. O backend deve implementar:

- consentimento explícito por participante;
- finalidade clara de uso;
- retenção configurável;
- pseudonimização de participantes;
- exclusão sob solicitação;
- segregação entre vídeo bruto e features;
- política para apagar vídeo bruto após extração, quando possível;
- termo proibindo uso para vigilância, punição individual ou avaliação automatizada do aluno.

### 10.5. Reprodutibilidade

Cada predição deve registrar:

- versão do modelo;
- hash do artefato;
- versão do código;
- parâmetros de normalização;
- threshold;
- data/hora;
- versão do pipeline;
- qualidade do vídeo.

---

## 11. Estratégia de ML/MLOps

### 11.1. Model registry simples

No MVP, não precisa começar com MLflow obrigatório. Pode usar uma tabela `micro_action_models` + artefatos no S3.

Campos mínimos:

```json
{
  "name": "OLHO_FECHADO",
  "version": "1.0.0",
  "artifact_uri": "s3://models/olho_fechado/1.0.0/model.onnx",
  "input_spec": {
    "window_size": 7,
    "features": 200,
    "regions": ["eyes", "iris"]
  },
  "metrics": {
    "auc": 0.91,
    "f1": 0.72
  }
}
```

### 11.2. Formato de modelo recomendado

Para produção, preferir ONNX quando possível:

- menor acoplamento ao framework de treino;
- inferência mais simples;
- versionamento mais previsível.

Caso o modelo atual esteja em Keras/TensorFlow, aceitar Keras no MVP e planejar conversão para ONNX posteriormente.

### 11.3. Monitoramento de drift

Coletar:

- taxa de frames inválidos por turma/instituição;
- distribuição de landmarks;
- distribuição de scores por microação;
- variação por câmera/dispositivo;
- taxa de vídeos rejeitados;
- divergência entre anotação humana e predição em amostras auditadas.

---

## 12. Testes

### 12.1. Testes unitários

- Normalização de pontos.
- Geração de janelas de 7 frames.
- Remoção de previsões consecutivas.
- Cálculo de contagem de eventos.
- Cálculo de learning gain.
- Validação de payloads.
- Permissões por role.

### 12.2. Testes de integração

- Upload -> complete-upload -> job queued.
- Worker processa vídeo de amostra.
- Resultado salvo no banco.
- Download de relatório.
- Cancelamento e retry de job.

### 12.3. Testes de regressão ML

- Mesmo vídeo + mesma versão de modelo deve gerar resultado idêntico ou dentro de tolerância.
- Alteração de modelo deve gerar nova versão, nunca sobrescrever resultado antigo.

### 12.4. Testes de carga

Cenários mínimos:

- 10 uploads simultâneos de vídeos de 400MB.
- 50 usuários consultando dashboard.
- 5 workers processando vídeos em paralelo.

---

## 13. Deploy

### 13.1. Ambiente local

```text
Docker Compose:
- api
- postgres
- redis
- worker
- minio
```

### 13.2. Staging

- API + worker em containers.
- Banco gerenciado se possível.
- Storage S3/MinIO.
- Logs centralizados.

### 13.3. Produção

Opção enxuta:

- API em ECS/Fargate ou EC2 Docker.
- Workers CPU em ECS/EC2.
- Worker GPU separado quando necessário.
- PostgreSQL gerenciado.
- S3.
- Redis gerenciado.

Opção escalável:

- EKS.
- HPA para API.
- KEDA para workers baseado no tamanho da fila.
- Node group GPU separado.
- S3 + RDS + ElastiCache.

---

## 14. Backlog por sprint

### Sprint 0 — Fundação

- Criar repositório backend.
- Configurar FastAPI.
- Configurar Docker Compose.
- Configurar PostgreSQL, Redis e MinIO.
- Criar Alembic migrations.
- Criar autenticação básica.
- Criar CI com lint, type-check e testes.

### Sprint 1 — Domínio e upload

- Implementar projetos, estudos, participantes e sessões.
- Implementar consentimento.
- Implementar upload pré-assinado.
- Implementar validação básica de vídeo.
- Implementar jobs e status.

### Sprint 2 — Pipeline de vídeo

- Implementar extração de metadados.
- Implementar worker de frames.
- Implementar FaceMesh.
- Salvar landmarks em Parquet/JSON.
- Calcular quality_score.

### Sprint 3 — Inferência

- Implementar model registry simples.
- Carregar modelo versionado.
- Gerar janelas de 7 frames.
- Rodar inferência por microação.
- Salvar séries temporais e resumo.

### Sprint 4 — Relatórios

- Implementar learning gain.
- Implementar agregações por estudo/aula/grupo.
- Implementar exportação CSV/JSON/Parquet.
- Criar endpoints de dashboard.

### Sprint 5 — Anotação e auditoria

- Endpoints para frames amostrados.
- CRUD de anotações.
- Exportação de dataset anotado.
- Auditoria de acesso.

---

## 15. Definition of Done

O backend só deve ser considerado pronto para MVP quando:

- Processar vídeo sem travar a API.
- Registrar status de job em tempo real.
- Gerar landmarks reproduzíveis.
- Rodar inferência com versão de modelo registrada.
- Gerar resumo por microação.
- Exportar resultados.
- Implementar consentimento e exclusão de participante.
- Ter testes unitários dos cálculos centrais.
- Ter logs e erros rastreáveis.

---

## 16. Pontos críticos antes de começar

Responda antes de implementar:

1. O produto será usado para pesquisa, diagnóstico educacional ou otimização de conteúdo?
2. O vídeo bruto será armazenado permanentemente ou apagado após extração dos landmarks?
3. Haverá consentimento explícito dos participantes?
4. O sistema precisa de multi-tenant desde o início?
5. Os modelos atuais estão salvos em qual formato?
6. A anotação humana será parte do MVP ou fase 2?
7. O objetivo comercial é vender dashboard para instituições ou ferramenta interna de pesquisa?

A resposta muda arquitetura, custo e risco jurídico.
