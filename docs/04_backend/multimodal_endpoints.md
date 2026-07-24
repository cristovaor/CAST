# CAST Pro — Backend multimodal: endpoints, banco e uploads

Camada de backend que dá suporte à evolução multimodal do frontend (vídeo + EEG
sincronizados, datasets reprodutíveis, governança). Stack existente: FastAPI +
SQLAlchemy + Alembic + Celery + MinIO/S3. App valida import com **110 rotas** e
**21 tabelas** mapeadas.

## 1. Entidades de banco adicionadas (`app/db/models.py`)

- **Session** (estendida): `state` (12 estados, docs §8), `condition`,
  `protocol`, `operator`, `recorded_at`, `duration_seconds`, `notes`.
- **VideoAsset** (estendida): `quality_verdict`, `quality_report` (JSONB).
- **EEGAsset** (estendida): `eeg_format`, `device`, `manufacturer`, `model`,
  `channel_count`, `channel_names`, `montage`, `reference`, `resolution_bits`,
  `units`, `duration_seconds`, `start_timestamp`, `event_count`,
  `quality_verdict`, `valid_ratio`, `channel_quality`, `quality_findings`,
  `quality_criteria`.
- **Synchronization** (nova, docs §11): estado, método, offset, drift,
  confiança, âncoras, histórico, decisão + justificativa.
- **ResearchVariable** (nova, docs §14): papel, origem, modalidade, método.
- **Dataset** (nova, docs §17): versão, nível, estado, manifesto, checksum.
- **AuditLog** (nova, docs §21): ação, ator, entidade, justificativa.

Enums novos: `SessionState`, `QualityVerdict`, `SyncState`, `DatasetState`,
`AuditAction`. Enum `JobType` estendido (`quality_check`, `eeg_quality`, `sync`,
`dataset_build`) — corrige o bug pré-existente onde `routes_videos` usava
`JobType.quality_check` inexistente.

`app/db/base.py` agora importa **todos** os modelos (autogenerate do Alembic e
`create_all` enxergavam apenas um subconjunto antes).

## 2. Endpoints (`/api/v1`)

**Sessões** (`routes_sessions.py`): `POST /sessions/`, `GET /sessions/{id}`,
`PATCH /sessions/{id}` (transição de estado/metadados), `DELETE`, `GET /sessions/`.

**EEG** (`routes_eeg.py`, estendido): `GET /eeg/{id}` (metadados+qualidade),
`PATCH /eeg/{id}/metadata`, `POST /eeg/{id}/quality-check` (deriva qualidade por
canal do CSV — sem score único), `PUT /eeg/{id}/quality` (decisão revisada).
Mantém `upload-proxy`, `timeseries`, `coactivation`, offset.

**Sincronização** (`routes_sync.py`): `GET /sync/{sessionId}` (cria se ausente),
`PATCH /sync/{sessionId}` (offset/método/âncoras — mantém `EEGAsset.sync_offset_ms`
consistente), `POST /sync/{sessionId}/decision` (aprovar/invalidar, justificativa
obrigatória, grava AuditLog e move a sessão para `synced`).

**Datasets** (`routes_datasets.py`): `GET/POST /datasets/`, `GET /datasets/{id}`,
`POST /datasets/{id}/freeze` (checksum + lock), `GET /datasets/{id}/export`
(manifesto como download + AuditLog de exportação).

**Variáveis** (`routes_variables.py`): CRUD com filtro `?study_id=`.

**Governança** (`routes_governance.py`): `GET /governance/audit`,
`POST /governance/audit`, `GET /governance/summary`,
`POST /governance/participants/{id}/revoke-consent`. Helper `assert_consent_valid`
para bloquear análise sem consentimento válido.

## 3. Uploads e storage

`storage_service` ganhou `download_bytes`, `key_from_uri` e `delete_object`.
Fluxos de upload existentes (`/videos/upload-proxy`, `/videos/init-upload`
presigned, `/eeg/upload-proxy`) permanecem; o EEG agora enriquece metadados via
`PATCH /eeg/{id}/metadata` e avalia qualidade via `POST /eeg/{id}/quality-check`.

## 4. Migração

`alembic/versions/002_multimodal_entities.py` (revisão `002`, sobre `001`).
Escrita de forma **defensiva** (checa colunas/tabelas existentes; `ADD VALUE IF
NOT EXISTS` para o enum `jobtype`), segura em bancos pré-existentes.

```bash
cd src
alembic upgrade head
```

## 5. Ligação com o frontend

`frontend/src/features/multimodal/useMultimodal.ts` expõe hooks React Query para
sessão, EEG (+quality-check), sync (get/patch/decision), datasets (+freeze),
variáveis e governança. As telas `SessionDetail`, `EEGQuality`, `Sync`,
`Datasets`, `Variables` e `Governance` consomem dados reais com **fallback para
mock** quando offline. Export de dataset aponta para `GET /datasets/{id}/export`.

## 6. Validação executada

- Import completo da app: OK (110 rotas).
- Metadata: 21 tabelas mapeadas (inclui `synchronizations`, `datasets`,
  `research_variables`, `audit_logs`).
- Migração 002: parse OK, encadeia em 001.
- Frontend: `npm run build` OK; novos arquivos sem erro de lint.

Testes que exigem Postgres/MinIO/tensorflow não rodam neste ambiente (serviços e
deps ML ausentes) — são gaps ambientais pré-existentes, não do código novo.
