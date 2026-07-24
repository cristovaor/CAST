# Fase 8 — Estratégia de Testes

## 1. Pirâmide

- Unitários: funções de normalização, colapso de eventos, validações.
- Integração: API + DB + Redis + S3 fake.
- E2E: upload → processamento → timeline → export.
- ML tests: shape, schema, determinismo parcial, métricas.
- Segurança: RBAC e arquivos.

## 2. Testes unitários obrigatórios

### Normalização

- bounding box sem divisão por zero;
- pontos fora da região;
- região ausente;
- saída dentro do esperado.

### Janelas

- vídeo com N frames gera N-6 janelas;
- label é do último frame;
- shape correto.

### Colapso

```text
00000111111100111 → 0101 → count=2
```

### Consentimento

- bloquear processamento sem consentimento;
- consentimento revogado bloqueia novo job.

## 3. Testes de integração

- criar estudo;
- cadastrar participante;
- registrar consentimento;
- gerar upload URL;
- registrar vídeo;
- iniciar job;
- salvar artifact;
- consultar timeline;
- exportar dados.

## 4. Testes E2E

Fluxo mínimo:

```text
login → criar estudo → participante → consentimento → upload vídeo sintético → processar → timeline → exportar
```

## 5. Testes ML

- modelo aceita input `[batch, 7, n_features]`;
- thresholds aplicados corretamente;
- versão do modelo aparece no resultado;
- dataset_version aparece no relatório;
- predição vazia não quebra relatório.

## 6. Testes de performance

- vídeo 3 min 1080p;
- vídeo 10 min 720p;
- 10 jobs simultâneos;
- timeline com 5.000+ eventos.

## 7. Testes de segurança

- usuário de outro estudo não acessa vídeo;
- anotador não baixa vídeo bruto;
- URL expirada falha;
- export sem permissão falha;
- audit log registra download.
