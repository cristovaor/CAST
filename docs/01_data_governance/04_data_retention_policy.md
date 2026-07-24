# Fase 1 — Política de Retenção e Exclusão de Dados

## 1. Objetivo

Definir por quanto tempo cada artefato será mantido e como será excluído.

## 2. Classes de dados

| Classe | Exemplo | Retenção padrão | Exclusão |
|---|---|---:|---|
| RAW_VIDEO | MP4 original | 365 dias | hard delete no storage |
| DEBUG_FRAME | frame extraído | 7 dias | job automático |
| LANDMARKS | parquet/json de pontos | 365 dias | hard delete se vinculável |
| ANNOTATION | eventos manuais | 365 dias | delete/anonymize |
| INFERENCE | eventos modelo | 365 dias | recalculável; pode apagar |
| REPORT | PDF/HTML/CSV | 180 dias | apagar arquivo e export request |
| AUDIT_LOG | acesso/alteração | 5 anos | retenção legal/interna |

## 3. TTL por bucket

```text
s3://cast-raw-videos/{env}/        lifecycle: 365d
s3://cast-debug-frames/{env}/      lifecycle: 7d
s3://cast-landmarks/{env}/         lifecycle: 365d
s3://cast-reports/{env}/           lifecycle: 180d
s3://cast-models/{env}/            lifecycle: manual/versionado
```

## 4. Soft delete vs hard delete

- Entidades transacionais usam soft delete para auditoria.
- Arquivos sensíveis usam hard delete no storage.
- Logs não devem conter conteúdo sensível.

## 5. Exclusão por revogação

Fluxo:

```text
request_received → validation → freeze_processing → delete_artifacts → anonymize_records → audit → notify_requester
```

## 6. Testes obrigatórios

- [ ] excluir participante com vídeo processado;
- [ ] excluir participante com job em andamento;
- [ ] excluir participante com export pendente;
- [ ] garantir que URL pré-assinada antiga não acesse arquivo;
- [ ] garantir que relatório antigo seja invalidado.
