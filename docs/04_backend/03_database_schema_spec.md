# Fase 4 — Especificação do Banco de Dados

## 1. Objetivo

Definir o schema transacional em PostgreSQL para estudos, participantes, vídeos, consentimentos, jobs, artefatos, anotações, modelos e auditoria.

## 2. Princípios

- UUID como chave primária.
- Soft delete para entidades transacionais.
- Arquivos grandes fora do banco.
- Artefatos derivados versionados.
- Auditabilidade obrigatória.
- Nenhuma predição sem `model_version`.

## 3. Tabelas P0

| Tabela | Finalidade |
|---|---|
| users | usuários do sistema |
| roles | papéis |
| studies | estudos |
| participants | participantes pseudonimizados |
| consents | consentimentos versionados |
| learning_sessions | sessão de aula/coleta |
| videos | metadados do vídeo |
| video_quality_reports | qualidade do vídeo |
| processing_jobs | jobs assíncronos |
| processing_artifacts | arquivos derivados |
| annotation_tasks | tarefas de anotação |
| annotation_events | eventos anotados |
| model_versions | modelos |
| inference_runs | execuções de inferência |
| predicted_events | eventos preditos |
| exports | exportações |
| audit_logs | auditoria |

## 4. Enums

```sql
CREATE TYPE job_status AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE video_quality_status AS ENUM ('PENDING', 'ACCEPTED', 'DEGRADED', 'REJECTED');
CREATE TYPE micro_action AS ENUM ('OF', 'OC', 'ML', 'VR', 'NEUTRO');
CREATE TYPE annotation_status AS ENUM ('PENDING', 'IN_PROGRESS', 'SUBMITTED', 'CONFLICTED', 'REVIEWED', 'APPROVED');
```

## 5. Índices críticos

- `videos(study_id, participant_id)`
- `processing_jobs(video_id, status)`
- `annotation_events(video_id, action, start_frame)`
- `predicted_events(video_id, inference_run_id, action)`
- `audit_logs(actor_user_id, created_at)`
- `consents(participant_id, consent_version)`

## 6. Política de deleção

- `deleted_at` em estudos, participantes, vídeos e sessões.
- Artefatos sensíveis no S3 devem ser hard-deleted.
- Eventos e predições podem ser apagados e recalculados.
- Logs não devem armazenar conteúdo sensível.

## 7. Migração

Ferramenta recomendada: Alembic.

Diretórios:

```text
backend/
  app/db/models/
  alembic/versions/
  app/db/migrations/
```

## 8. Critério de aceite

- [ ] schema aplica do zero;
- [ ] constraints impedem evento inválido;
- [ ] índices cobrem queries principais;
- [ ] exclusão de participante remove artefatos;
- [ ] auditoria registra ações sensíveis.
