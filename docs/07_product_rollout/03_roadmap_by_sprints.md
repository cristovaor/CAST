# Fase 7 — Roadmap por Sprints

## Sprint 0 — Preparação

Objetivo: fechar ambiente e decisões.

Entregas:

- repositórios backend/frontend;
- Docker local;
- schema inicial;
- OpenAPI inicial;
- CI básico;
- buckets locais MinIO.

Critério de aceite:

- `docker compose up` funcional;
- API `/health` funcional;
- frontend abre tela de login mock.

## Sprint 1 — Governança e estudos

Entregas:

- auth;
- estudos;
- participantes;
- consentimentos;
- audit log inicial.

Critério:

- não é possível registrar vídeo sem participante e consentimento válido.

## Sprint 2 — Upload e qualidade

Entregas:

- upload URL;
- registro de vídeo;
- quality check;
- relatório de qualidade;
- UI de upload.

Critério:

- vídeo MP4 é enviado, validado e recebe ACCEPTED/DEGRADED/REJECTED.

## Sprint 3 — Landmarks e artefatos

Entregas:

- worker;
- extração MediaPipe;
- parquet de landmarks;
- normalização por região;
- visualização básica.

Critério:

- vídeo aceito gera landmarks versionados.

## Sprint 4 — Inferência inicial

Entregas:

- carregamento modelo;
- janelas de 7 frames;
- predição por microação;
- colapso de eventos;
- timeline modelo.

Critério:

- vídeo processado exibe eventos OF/OC/ML/VR.

## Sprint 5 — Anotação

Entregas:

- annotation tasks;
- player frame-aware;
- trilhas;
- atalhos;
- export frame-level.

Critério:

- anotador marca e submete eventos.

## Sprint 6 — Avaliação humano vs modelo

Entregas:

- comparação predição/anotação;
- métricas event-level;
- relatório avaliação;
- dashboard de modelo.

Critério:

- relatório mostra F1/erro relativo por microação.

## Sprint 7 — Exportação e relatório

Entregas:

- export CSV/Parquet;
- relatório HTML/JSON;
- filtros;
- auditoria de download.

Critério:

- pesquisador exporta dataset sem dados identificáveis por padrão.

## Sprint 8 — Staging e hardening

Entregas:

- deploy staging;
- observabilidade;
- backup;
- testes E2E;
- threat model revisado.

Critério:

- processamento ponta a ponta em staging.

## Sprint 9 — Piloto controlado

Entregas:

- 10 a 30 vídeos sob protocolo;
- dupla anotação;
- revisão de métricas;
- ajustes UX.

Critério:

- relatório de piloto decide go/no-go.
