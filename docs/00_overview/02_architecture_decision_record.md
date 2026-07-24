# Fase 0 — ADR Consolidado

## ADR-001 — Substituir Streamlit por React + FastAPI

**Decisão:** usar React + TypeScript no frontend e FastAPI no backend.

**Razão:** Streamlit é aceitável para protótipo científico, mas limita controle de estado, UX de anotação, autenticação, multiusuário, performance visual de timeline e separação entre produto e pipeline ML.

**Consequência:** exige contrato API formal, controle de jobs, autenticação e governança.

## ADR-002 — Processamento assíncrono

**Decisão:** usar fila com Redis/RQ ou Celery para processamento de vídeo.

**Razão:** upload, extração de frames, FaceMesh e inferência são tarefas longas. Request HTTP síncrono não é adequado.

## ADR-003 — Armazenamento de objetos

**Decisão:** vídeos, landmarks, relatórios e artefatos de modelo ficam em S3/MinIO.

**Razão:** PostgreSQL não deve armazenar blobs grandes. Banco guarda metadados e referências.

## ADR-004 — PostgreSQL como fonte transacional

**Decisão:** PostgreSQL para estudos, sessões, participantes, jobs, consentimentos e auditoria.

## ADR-005 — Landmarks como dado derivado versionado

**Decisão:** landmarks serão artefatos versionados e tratados como dados pessoais derivados.

## ADR-006 — Sem frames permanentes por padrão

**Decisão:** não persistir frames extraídos permanentemente. Frames só em debug com TTL.

## ADR-007 — Separar predição de microação e inferência educacional

**Decisão:** o modelo detecta microações; análises sobre aprendizagem/carga cognitiva são outra camada estatística.

## ADR-008 — Model registry obrigatório

**Decisão:** todo resultado precisa conter `model_version`, `dataset_version`, `pipeline_version` e `threshold_set_version`.

## ADR-009 — Multi-tenant adiado

**Decisão:** MVP single-tenant ou tenant único lógico. Multi-tenant institucional vai para P2.

## ADR-010 — GPU opcional no MVP

**Decisão:** pipeline deve rodar em CPU para viabilidade local/staging; GPU entra para escala.
