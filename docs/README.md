# CAST Pro — Cognitive Analysis System — Pacote de Especificações por Fase

**Data:** 2026-06-13  
**Objetivo:** transformar o protótipo científico/Streamlit do CAST em uma plataforma profissional com backend Python/FastAPI, frontend React, pipeline ML replicável, governança LGPD e operação produtiva.

## Diagnóstico executivo

O sistema é viável como produto técnico e científico, desde que o posicionamento inicial seja conservador: **análise de microações faciais em sessões de aprendizagem multimídia**, e não diagnóstico definitivo de carga cognitiva. A dissertação sustenta uma prova de conceito, mas aponta necessidade de coleta maior, mais padronizada e validação mais rigorosa.

## Estrutura do pacote

```text
cast_artifacts_phases/
  00_overview/
  01_data_governance/
  02_dataset_annotation/
  03_model_validation/
  04_backend/
  05_frontend/
  06_infra_operations/
  07_product_rollout/
  08_backlog_tests/
  references/
```

## Ordem recomendada de execução

| Fase | Entrega | Critério de saída |
|---|---|---|
| 0 | Escopo, arquitetura alvo e decisões | MVP definido, não objetivos explícitos, riscos aceitos |
| 1 | Coleta, consentimento, retenção e LGPD | Coleta padronizada e juridicamente defensável |
| 2 | Dataset e anotação | Ground truth confiável com dupla anotação |
| 3 | Modelo e validação | Replicação metodológica, métricas e registry |
| 4 | Backend | API, banco, workers e pipeline assíncrono |
| 5 | Frontend | React profissional, dashboards e anotação |
| 6 | Infra/operação | Deploy, observabilidade, segurança e CI/CD |
| 7 | Produto/rollout | KPIs, LMS, roadmap e go-to-market técnico |
| 8 | Backlog/testes | Épicos, critérios de aceite e QA |

## Decisões críticas

1. Não armazenar frames extraídos por padrão; frames só em modo debug com expiração curta.
2. Tratar vídeo facial, landmarks e metadados como dados pessoais de alto risco operacional.
3. Versionar tudo: dataset, anotação, modelo, pipeline, thresholds, relatórios e consentimentos.
4. Separar inferência de microações de inferência educacional. Microação não é automaticamente carga cognitiva.
5. Começar com validação offline antes de vender análise em tempo real.

## Artefatos principais

- `01_data_governance/01_data_collection_protocol.md`
- `01_data_governance/02_lgpd_governance_spec.md`
- `02_dataset_annotation/02_annotation_protocol.md`
- `03_model_validation/01_model_replication_spec_cast.md`
- `03_model_validation/02_evaluation_protocol.md`
- `04_backend/02_api_contract_openapi.md`
- `04_backend/openapi.yaml`
- `04_backend/03_database_schema_spec.md`
- `04_backend/schema.sql`
- `05_frontend/02_frontend_design_system.md`
- `06_infra_operations/01_deployment_runbook.md`
- `07_product_rollout/03_roadmap_by_sprints.md`

## Próximo passo recomendado

Antes de implementar novas telas, executar uma sprint de documentação operacional:

```text
Semana 1: protocolo de coleta + consentimento + schema inicial
Semana 2: anotação + API + banco
Semana 3: pipeline ML offline + validação
Semana 4: frontend MVP + deploy staging
```
