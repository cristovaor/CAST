# CAST Pro — Auditoria de conclusão, pendências e melhorias

Revisão do que foi entregue na evolução multimodal (frontend + backend) frente
aos critérios de aceite (§28) e à lista de entregáveis (§27), com o que ficou
pendente e o que pode ser melhorado **seguindo o mesmo padrão** (fallback para
mock, linguagem científica conservadora, rastreabilidade, versionamento).

## 1. Estado atual — o que está concluído

| Área | Status | Evidência |
|---|---|---|
| Navegação global (14 seções) | ✅ | `Sidebar.tsx` |
| Navegação contextual de estudo (12 abas + breadcrumb) | ✅ | `StudyLayout.tsx` |
| Wizard de estudo configurável (13 desenhos, sem viés educacional) | ✅ **agora persiste** | `StudyWizard.tsx` → `Study.config` |
| Wizard de sessão (modalidades opcionais) | ⚠️ UI ok, **não persiste** | `SessionWizardLayout.tsx` |
| Sessão multimodal com estados | ✅ | `SessionDetailPage.tsx` + `/sessions` |
| Importação/qualidade de EEG (por canal) | ✅ | `EEGQualityPage.tsx` + `/eeg/quality-check` |
| Sincronização vídeo↔EEG | ✅ | `SyncPage.tsx` + `/sync` |
| Workspace de análise sincronizada | ⚠️ UI ok, **dados sintéticos** | `AnalysisWorkspacePage.tsx` |
| Datasets versionados + manifesto | ✅ | `DatasetsPage.tsx` + `/datasets` |
| Variáveis científicas | ✅ leitura; ⚠️ criação só backend | `VariablesPage.tsx` + `/variables` |
| Governança + auditoria | ✅ | `GovernancePage.tsx` + `/governance` |
| Linguagem determinística | ✅ zerada | grep sem ocorrências |
| Banco: 21 tabelas + migração 002 | ✅ | `models.py`, migração parseia |
| App importa (110 rotas) | ✅ | smoke test |

## 2. Corrigido nesta rodada

1. **StudyConfig agora persiste.** Adicionado `Study.config` (JSONB) + schema +
   migração; o `StudyWizard` virou formulário controlado que grava questão,
   objetivos, hipóteses, desenho, modalidades, grupos, variáveis, retenção e
   finalidade. Antes o wizard só navegava (critério §28 "hipóteses e variáveis
   configuráveis" estava incompleto no backend).
2. **Bug de export de estudo.** `routes_studies.export` usava `s.video_assets`
   (plural inexistente) e `v.quality_score`/`v.face_detection_rate` (colunas
   inexistentes) — quebraria em runtime. Reescrito para `s.video_asset`/
   `s.eeg_asset` e os verdicts de qualidade reais.
3. `project_id` do estudo tornou-se opcional (rascunho antes de anexar a projeto).

## 3. Pendências priorizadas (mesma abordagem)

### P0 — fecham critérios de aceite ainda parciais ✅ CONCLUÍDO
- ✅ **Wizard de sessão persiste**: `SessionWizardLayout` agora cria a sessão via
  `POST /sessions/` na primeira etapa e passa o `sessionId` adiante; ao final
  move para `ready_to_sync` e navega para a sessão real.
- ✅ **Sessão + upload no mesmo fluxo**: `videos/upload-proxy` agora aceita
  `session_id` (como o EEG), anexando à sessão do wizard em vez de criar outra.

### P1 — completam a experiência multimodal ✅ CONCLUÍDO (parcial)
- ✅ **Criação de variáveis pela UI**: `CreateVariableDialog` (papel, origem,
  tipo, unidade, método) grava via `POST /variables/`.
- ✅ **Workspace com dados reais**: `AnalysisWorkspacePage` liga a
  `/eeg/{id}/timeseries` e `/videos/{id}/timeline`, desenha as bandas reais e
  monta as faixas a partir dos eventos, aplicando `sync_offset_ms`. Fallback
  sintético mantido quando a sessão não tem vídeo/EEG.
- ✅ **Qualidade de EEG revisada**: painel "Decisão do pesquisador" grava o
  veredito via `PUT /eeg/{id}/quality`.
- ✅ **Upload real de EEG com parsing** (EDF/EDF+/BDF/BrainVision/FIF/EEGLAB/CSV):
  `app/services/eeg_service.py` extrai metadados reais (formato, canais, taxa,
  duração, eventos) e qualidade por canal, usando **MNE** quando instalado com
  **fallback CSV nativo**. Worker `app/workers/tasks_eeg.py` (Celery) baixa do
  storage e grava no `EEGAsset`; endpoint `POST /eeg/{id}/parse` (dispatch async
  com fallback síncrono via `?sync=true`); parse disparado automaticamente no
  upload. UI: botão "Reprocessar arquivo" na tela de EEG. `mne`/`pyedflib`
  adicionados a `requirements-ml.txt` (opcionais em runtime).
- ⏳ **Detecção automática de sincronização**: ainda manual; requer worker.

### P2 — robustez e governança ✅ CONCLUÍDO (parcial)
- ✅ **Consent guard**: `assert_consent_valid_for_video` aplicado em
  `POST /videos/{id}/infer` — bloqueia inferência sem consentimento válido (§21).
- ✅ **Auditoria de acesso bruto**: `record_access` grava AuditLog em
  `videos/{id}/playback-url`, `eeg/{id}/timeseries` e na inferência.
- ✅ **Transição automática de estados de sessão**: `app/services/session_state_service.py`
  deriva o estado (draft→awaiting_data→incomplete→ready_to_sync→syncing→synced→
  processing→review_required) a partir do que existe de fato (vídeo, EEG, sync,
  vereditos de qualidade); estados manuais (approved/excluded/archived) são
  "sticky" e nunca sobrescritos. Chamado após upload de vídeo/EEG, quality-check,
  decisão de qualidade e decisão de sync.
- ✅ **Detecção automática de sincronização**: `app/services/sync_detection_service.py`
  propõe offset por correlação cruzada entre densidade de eventos faciais e
  atividade do EEG (testado: recupera exatamente um lag conhecido de +5000ms
  com confiança 0.94). Worker `tasks_sync.py` + endpoint `POST /sync/{id}/detect`.
  Sempre cai em `auto_available` — nunca aprova sozinho.
- ✅ **Datasets: build real**: `app/services/dataset_service.py` seleciona
  sessões por critérios de inclusão/exclusão (estudo, condição, modalidades,
  sync aprovada, consentimento, EEG válido mínimo) e monta os registros
  multimodais mantendo dado observado/derivado distintos. Worker
  `app/workers/tasks_dataset.py` materializa o artefato (JSON com manifesto +
  registros + excluídos), calcula checksum e grava no storage, registrando
  lineage (incluídos/excluídos + motivo). Endpoints `POST /datasets/preview`
  (dry-run) e `POST /datasets/{id}/build` (dispatch async + fallback síncrono).
  UI: `BuildDatasetDialog` com critérios e prévia ao vivo, botão "Construir" na
  tela de datasets.

## 4. Ciclo fechado — auditoria full-stack (2ª rodada)

Auditoria dedicada (agente Explore) varreu o restante do código em busca de
dados fabricados apresentados como reais, gaps de auditoria e bugs de rota.
Todos os P0 e a maioria dos P1 identificados foram corrigidos nesta rodada:

### P0 corrigidos
- **`SessionDetailPage` sempre mostrava `MOCK_*`** mesmo com sessão real
  carregada (vídeo/EEG/sync fixos independente dos dados). Agora consome
  `useEEGAsset`, `useVideoQualityReport` e `useSync` de verdade, com fallback
  a mock só quando não há `sessionId` nenhum.
- **`routes_dashboard.py`**: join errado (`Session.participant_id == Study.id`,
  comparando FK de participante com PK de estudo — retornava lixo silencioso)
  e KPIs inteiramente hardcoded (`total_sessions=237`, `videos_processed=143`,
  `average_quality=0.942`, séries temporais e "recentes" fixos). Reescrito com
  agregações SQL reais pela cadeia Session→Participant→Study→Project.
- **`routes_reports.py`**: `generate_study_report` usava um UUID nulo fake
  como `user_id` em vez do usuário autenticado — todo relatório gerado ficava
  com autoria errada. `get_dynamic_pdf_report` fabricava um "Paciente_XXX"
  com métricas clínicas e evolução pré/pós inventadas — exatamente o padrão
  de linguagem clínica/determinística que a plataforma deveria evitar (§1,
  §28). Reescrito para consumir contagens reais do estudo (participantes,
  sessões, vídeos, EEG, vereditos de qualidade) e o gerador de PDF
  (`pdf_generator.py`) foi generalizado de "Relatório Clínico" para
  "Relatório de Estudo", com aviso de não-causalidade embutido.

### P1 corrigidos
- **Auditoria de governança estendida**: `record_access`/`AuditLog` agora
  também cobre `routes_exports.py` (criação e download de export),
  `routes_annotations.py` (correção + export de anotação) e
  `routes_reports.py` (geração de relatório JSON/PDF) — antes só sync/dataset/
  vídeo/EEG geravam trilha de auditoria.
- **`routes_annotations.py`**: duas rotas usavam `..` no path
  (`/annotation-tasks/../annotation-events/{id}`) — FastAPI/ASGI não
  normaliza `..`, então essas rotas nunca batiam com requisições reais.
  Movidas para um router próprio sem o prefixo `/annotation-tasks`. O export
  de correção "mockava" o upload ao MinIO com um `print()` — agora grava de
  fato via `storage_service.upload_bytes` em `retrain_dataset/annotations/`.
- **`routes_projects.py`**: `_build_project_detail` iterava em Python
  aninhado (`studies → participants → sessions`) por projeto, um padrão N+1
  que não escala; `average_quality`/`status`/`last_activity` eram hardcoded.
  Reescrito com agregações SQL em lote e status/qualidade derivados de dados
  reais (`Study.status`, `VideoAsset.quality_verdict`).
- **`ProjectDetailPage.tsx`**: rodava inteiramente sobre `MOCK_PROJECTS`, sem
  nenhum caminho para dados reais. Agora usa `useProject(id)` com fallback a
  mock.
- **Rota duplicada**: `GET /studies/{study_id}/dashboard` estava registrada
  duas vezes (`routes_studies.py` e `routes_reports.py`), com a versão
  hardcoded (`average_learning_gain = 0.15`) sombreando silenciosamente a
  versão real. Consolidado em uma única implementação com ganho de
  aprendizagem calculado de verdade a partir de `LearningAssessment` (0.0
  quando o estudo não usa pré/pós-teste — nunca inventado).
- **Cobertura de testes**: 28 testes novos em `tests/services/` para os 5
  serviços desta fase (`eeg_service`, `video_quality_service`,
  `sync_detection_service`, `session_state_service`, `dataset_service`), que
  não tinham nenhuma cobertura. Todos passam; um bug de coerção UUID/SQLite
  em `dataset_service.build_manifest` foi pego pelos testes e corrigido.

### Validação final
- App importa: 113 rotas, **zero conflitos de path+método** (era 1 antes da
  correção do dashboard duplicado).
- `alembic` migração 002 parseia e encadeia corretamente.
- `npm run build` limpo; lint dos arquivos tocados sem novos erros.
- 36/37 testes de API+serviços passam; a 1 falha (`test_register_user`) é
  pré-existente, em código não tocado nesta sessão.

### Ainda pendente (fora do escopo desta rodada)
- `routes_models_v2.py`: 5 blocos quase idênticos de construção de
  `ModelVersionResponse` — dívida de manutenção, não bug.
- Adoção inconsistente do design system (`ToneBadge`/`ScientificCaveat`/
  `QualityFindings`) em páginas mais antigas (`GlobalAnnotationsPage`,
  `ModelsPage`, `ReportsPage`, `TimelinePage` etc.).
- `docs/04_backend/openapi.yaml` e `schema.sql` datam de antes de todo o
  trabalho multimodal — desatualizados frente aos 21+ modelos atuais.
- `ConsentBar` em `ProjectDetailPage` ainda usa valores fixos (85/10/5).

### P3 — dívida pré-existente (não introduzida aqui)
- 33 erros de lint `no-explicit-any` em arquivos antigos (`useVideos`,
  `ProcessingPage`, `domain.ts`…).
- Deps ausentes no venv local (`tensorflow`, e antes `reportlab`) impedem rodar
  a suíte de testes; testes exigem Postgres/MinIO ativos.
- Pydantic v1 `class Config` em `routes_models_v2` (deprecation warning).

## 4. Como validar end-to-end
```bash
docker-compose up -d          # Postgres + MinIO + Redis
cd src && alembic upgrade head # aplica 001 + 002
uvicorn app.main:app --reload  # backend :8000
cd ../frontend && npm run dev  # frontend :5173
```
Sem os serviços, as telas caem no fallback de mock (por desenho) e o backend
valida por import (110 rotas, 21 tabelas).

## 5. Recomendação de sequência
1. Persistir wizard de sessão + anexar uploads (P0) — destrava o fluxo 2 inteiro.
2. Modal de criação de variáveis + persistência de qualidade EEG (P1) — baixo custo.
3. Workspace com séries reais (P1) — maior valor científico.
4. Consent guard + auditoria de acesso bruto (P2) — fecha §21.
