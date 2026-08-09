# 05 — Multimodal Research Explorer

## Objetivo
Evoluir o workspace para `/app/sessions/:sessionId/explorer`, agregando descritores e carregando amostras pelas APIs de cada modalidade.

## Dependências
Player, sync, EEG tiles, timeline, React Query, store de playback, datasets/reports e dados existentes de vídeo/EEG.

## Não objetivos
Séries no store global, endpoint/processador multimodal genérico, inferência automática entre grupos ou anomalias não validadas.

## Backend
`GET /sessions/{id}/explorer-manifest` retorna disponibilidade, provenance, limites, qualidade e URLs independentes. Samples ficam nas APIs de modalidade; bookmarks são session-scoped.

## Frontend
Shell agnóstico; cada integração exporta descriptor, hook e componente. Scrub, zoom, intervalo, 0,25×/0,5×/1×/2×, frame↔EEG, markers, comentários, bookmarks, AOIs, comparação, figura, export e duas sessões compatíveis. `/analysis` redireciona preservando parâmetros.

## Worker/agente
Reutilizar dataset/report. Cada modalidade materializa seus tiles; não existe “multimodal processor”.

## Contratos
Manifest só descritivo. Zustand: relógio, janela, seleção, velocidade e comandos efêmeros. React Query cacheia por track/range.

## Experimento
HCI pareado contra workspace atual: tempo por hora, erros, concordância, SUS e NASA-TLX.

## Testes
Vitest de registro/hooks/store, redirect, cache; Playwright de scrub/zoom/export/bookmark/comparação; API nunca excede range/limit.

## Critérios de aceite
Economia mediana ≥15 min/h sem mais erros e SUS ≥70; tracks falham isoladamente; nenhuma série em Zustand.

## Rollback
Desabilitar `MULTIMODAL_EXPLORER_ENABLED` e redirecionar ao workspace antigo, mantendo contratos de track.

## Tarefas identificadas
`EXPLORER-001`, `EXPLORER-002`, `EXPLORER-003`, `EXPLORER-004`.

