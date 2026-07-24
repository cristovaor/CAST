# Fase 8 — Épicos e User Stories

## Épico 1 — Estudos e participantes

### US-001 Criar estudo
Como pesquisador, quero criar um estudo para organizar vídeos, participantes e relatórios.

Critérios:
- nome obrigatório;
- retenção configurável;
- consent_version associada.

### US-002 Cadastrar participante
Como pesquisador, quero cadastrar participante pseudonimizado.

Critérios:
- pseudônimo único por estudo;
- dados identificáveis opcionais e restritos;
- audit log.

## Épico 2 — Consentimento

### US-003 Registrar consentimento
Como pesquisador, quero registrar consentimento antes de processar vídeo.

Critérios:
- consentimento versionado;
- finalidades explícitas;
- bloqueia processamento se ausente.

## Épico 3 — Vídeo e processamento

### US-004 Enviar vídeo
Como pesquisador, quero enviar vídeo com segurança.

Critérios:
- URL pré-assinada;
- validação de tipo/tamanho;
- registro no banco.

### US-005 Validar qualidade
Como sistema, quero validar qualidade do vídeo.

Critérios:
- face_detected_rate;
- FPS/resolução;
- status ACCEPTED/DEGRADED/REJECTED.

### US-006 Processar microações
Como pesquisador, quero processar vídeo para obter timeline de microações.

Critérios:
- job assíncrono;
- progresso;
- eventos por ação;
- model_version visível.

## Épico 4 — Anotação

### US-007 Anotar microações
Como anotador, quero marcar eventos no vídeo.

Critérios:
- frame-aware;
- atalhos;
- autosave;
- submissão.

### US-008 Revisar conflitos
Como revisor, quero comparar anotações divergentes.

Critérios:
- mostrar eventos lado a lado;
- aceitar/editar decisão final;
- status APPROVED.

## Épico 5 — Relatórios e exportação

### US-009 Exportar dataset
Como pesquisador, quero exportar CSV/Parquet.

Critérios:
- sem dados identificáveis por padrão;
- inclui versões;
- audit log de download.

### US-010 Gerar relatório
Como pesquisador, quero relatório por vídeo/estudo.

Critérios:
- qualidade;
- microações;
- modelo;
- aviso de limitação.
