# 02 — MediaPipe Face Landmarker

## Objetivo
Substituir FaceMesh legado por Face Landmarker `VIDEO`, preservando artefatos antigos e gerando landmarks, 52 blendshapes, matriz facial, head pose e qualidade com PTS monotônicos.

## Dependências
`ACQ-004`, Parquet atual, `LandmarkArtifact`, storage e worker de visão.

## Não objetivos
DECA, EMOCA, FLAME, avatar, reconstrução 3D, emoção, atenção ou estado cognitivo. O `z` normalizado não é métrico.

## Backend
Migração `021` adiciona capabilities, URIs e checksums independentes. Manter `/videos/{id}/landmarks` e criar `/videos/{id}/face-features` com range/limit.

## Frontend
Overlay mesh/ROIs, tracks de pose, blendshapes e qualidade, proveniência e badge “estimativa/model output”. Legados exibem capacidades ausentes sem erro.

## Worker/agente
Serviço `vision` fixa inicialmente MediaPipe Python/web `0.10.35` e modelo oficial com SHA-256. Usa `detect_for_video` com PTS e separa RAW, NORMALIZED, FEATURES e QUALITY, registrando falhas, múltiplas faces, oclusão, blur e pose extrema.

## Contratos
Contrato temporal comum; head pose, eye openness, blink proxies, assimetria e velocidades com provenance/capability versionada.

## Experimento
Golden set VFR, sem face, múltiplas faces, óculos, oclusão e pose; comparar legado e v2 no domínio temporal.

## Testes
PTS monotônico, checksum, idempotência/reuse/cancelamento, camadas, leitura legada e proibição de rótulos cognitivos.

## Critérios de aceite
Landmarks + 52 blendshapes + matriz quando suportados; qualidade por amostra; nenhum `z` métrico; legados legíveis.

## Rollback
Desabilitar `FACE_LANDMARKER_V2_ENABLED`, manter reader dual e voltar a produzir legado sem apagar v2.

## Tarefas identificadas
`FACE-001`, `FACE-002`, `FACE-003`.

