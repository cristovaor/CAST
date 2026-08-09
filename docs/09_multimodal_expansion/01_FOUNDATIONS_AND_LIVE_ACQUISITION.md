# 01 — Fundações e aquisição ao vivo

## Objetivo
Adicionar contratos temporais compartilhados, captura WebM/MP4 retomável e bookmarks intervalados, produzindo um único `VideoAsset` válido somente após composição e verificação atômicas.

## Dependências
FastAPI/Celery/MinIO atuais, `Session`, `VideoAsset`, sincronização, autenticação multi-tenant e migração `018`.

## Não objetivos
Inferência científica ao vivo, gaze/pupila em tempo real, streaming de inferência, nova entidade central ou persistência do QA efêmero.

## Backend
O módulo `app.domains.acquisition` contém `VideoCaptureRun`, `VideoCapturePart` e `ResearchBookmark`. A API cria upload multipart, assina partes, registra checksum/ETag e completa de forma idempotente. Captura incompleta é retomável e nunca referencia `video_assets`. Constraints, clock, início/fim e âncoras ficam no domínio, não em `Session`.

## Frontend
Console `MediaRecorder`, chunks em IndexedDB até confirmação, recuperação após reload e indicadores de permissão, câmera, resolução, FPS, face, enquadramento, iluminação, quota e perda. QA é efêmero.

## Worker/agente
Serviço verifica tamanho/checksum, compõe objeto, normaliza contêiner, extrai PTS reais e só então cria `VideoAsset` e agenda Face Landmarker. Tasks são adaptadores finos.

## Contratos
`TimestampReference`, `TimeRangeQuery`, `SeriesEnvelope<T>`, `ArtifactProvenance` e `ExplorerTrackDescriptor`. Endpoints: `/sessions/{id}/video-captures`, `/video-captures/{id}/parts/presign`, `/complete`, `/abort` e `/sessions/{id}/bookmarks`. Mutações aceitam idempotência.

## Experimento
Sessões de 5, 30 e 120 minutos em Chrome/Edge, rede instável e reload; comparar contêiner, PTS e relógio do navegador.

## Testes
Upgrade/downgrade `019`, isolamento, duplicata, checksum incorreto, retomada, complete idempotente, câmera negada, quota cheia e VFR/dropped frames.

## Critérios de aceite
Parcial nunca vira `VideoAsset`; retomada não repete partes; checksum/PTS auditáveis; APIs respeitam limites; bookmarks usam tempo canônico.

## Rollback
Desabilitar `LIVE_CAPTURE_ENABLED`, abortar multiparts abertos, manter brutos concluídos e reverter `019` após tratar dependências.

## Tarefas identificadas
`ARCH-002`, `ARCH-003`, `ACQ-001`, `ACQ-002`, `ACQ-003`, `ACQ-004`.

