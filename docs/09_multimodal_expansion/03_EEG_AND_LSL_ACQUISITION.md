# 03 — EEG e aquisição LSL

## Objetivo
Gravar LSL e markers CAST em XDF por agente local, catalogar streams e reutilizar EEG/tiles e aprovação humana de sync.

## Dependências
Contratos temporais, upload, `EEGAsset`, workers EEG, `SyncEvidence`/`SyncRun`, pyxdf/MNE e LabRecorder.

## Não objetivos
Task Celery longa, driver universal, EEG como ground truth cognitivo ou sync aprovado automaticamente.

## Backend
Migração `022` cria `LSLRecording` e streams. APIs session-scoped para criação, discovery snapshot, complete e estado/provenance.

## Frontend
Pareamento, seleção de streams, taxa, canais, perda, duração, markers e iniciar/parar com caveat científico.

## Worker/agente
Agente loopback autenticado para health/discovery/start/marker/stop, token único, allowlist e LabRecorder. Envia XDF imutável. Worker pyxdf/MNE cria/reutiliza EEG/tiles e converte correções/markers em evidência de sync.

## Contratos
XDF preserva streams/correções. Marker usa `client_event_id`, idempotência e clocks. Tiles mantêm `start_seconds`, `end_seconds`, `limit`.

## Experimento
Gravações câmera/LSL com markers conhecidos, desconexões e taxas distintas; medir offset, drift, perda e incerteza.

## Testes
Sem stream, desconexão, marker duplicado, reconexão, XDF inválido, isolamento, retry/reuse e consistência PTS–LSL–EEG–eventos.

## Critérios de aceite
XDF imutável/checksum, streams catalogados, tiles limitados, evidência auditável e aprovação humana obrigatória.

## Rollback
Desabilitar `LSL_ACQUISITION_ENABLED`, revogar pares, parar agente e manter XDF/catalogação legíveis.

## Tarefas identificadas
`EEG-001`, `EEG-002`, `EEG-003`, `EEG-004`.

