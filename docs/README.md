# Documentação do CAST

Este diretório reúne especificações de produto e ciência, contratos técnicos,
runbooks operacionais e o registro de evolução do CAST. A implementação atual
é uma plataforma multimodal; os documentos V6 continuam disponíveis como base
histórica, não como visão geral da versão em produção.

**Última revisão do índice:** 2026-08-20.

## Por onde começar

| Necessidade | Documento canônico |
|---|---|
| Estado da expansão multimodal | [`09_multimodal_expansion/00_INDEX.md`](09_multimodal_expansion/00_INDEX.md) |
| Arquitetura e decisões | [`00_overview/02_architecture_decision_record.md`](00_overview/02_architecture_decision_record.md) |
| Contrato do Multimodal V8 | [`03_model_validation/05_multimodal_v8_spec.md`](03_model_validation/05_multimodal_v8_spec.md) |
| Pilha científica EEG | [`04_backend/eeg_analysis_v2.md`](04_backend/eeg_analysis_v2.md) |
| Endpoints multimodais | [`04_backend/multimodal_endpoints.md`](04_backend/multimodal_endpoints.md) |
| Evolução do frontend | [`05_frontend/multimodal_evolution.md`](05_frontend/multimodal_evolution.md) |
| Execução local | [`../README.md`](../README.md) |
| Deploy EasyPanel | [`deployment/DEPLOY_EASYPANEL.md`](deployment/DEPLOY_EASYPANEL.md) |
| Backlog e riscos | [`08_backlog_tests/pendencias_e_melhorias.md`](08_backlog_tests/pendencias_e_melhorias.md) |

## Organização

| Diretório | Conteúdo |
|---|---|
| `00_overview/` | charter, escopo, não objetivos e decisões arquiteturais |
| `01_data_governance/` | coleta, consentimento, retenção e LGPD |
| `02_dataset_annotation/` | schema de dataset e protocolo/ferramenta de anotação |
| `03_model_validation/` | replicação, avaliação, estatística, registry, V7 e V8 |
| `04_backend/` | API, banco, pipeline, OpenAPI e análise EEG |
| `05_frontend/` | requisitos, design system, fluxos e interface multimodal |
| `06_infra_operations/` | execução, observabilidade, segurança e CI/CD |
| `07_product_rollout/` | métricas, LMS, roadmap e critérios de aceite |
| `08_backlog_tests/` | épicos, estratégia de testes, riscos e pendências |
| `09_multimodal_expansion/` | planos executáveis e gates de validação multimodal |
| `cast_v6_model_specs/` | especificação histórica e compatibilidade do modelo V6 |
| `deployment/` | runbooks específicos de ambiente |
| `references/` | fontes e bases documentais |

O inventário das especificações canônicas está em [`MANIFEST.json`](MANIFEST.json).

## Estado técnico atual

- Aquisição ao vivo, Face Landmarker v2, contexto experimental, Explorer,
  gaze e pupillometria têm implementação integrada atrás de flags de recurso.
- LSL/XDF e validações científicas dependentes de hardware permanecem em
  revisão até existirem ensaios com equipamentos e arquivos golden reais.
- EEG Analysis V2 roda em worker isolado e usa wheels internos verificados por
  SHA-256. Artefatos vazios preservam schema e geram avisos auditáveis.
- A coativação EEG × microações usa a série completa, sincronização aprovada,
  pares evento/baseline pré-evento e FDR de Benjamini–Hochberg; eventos humanos
  e previstos são reportados separadamente.
- O Multimodal V8 mantém cabeça como modalidade obrigatória e EEG como ramo
  opcional na inferência, sujeito a qualidade, sincronização e gates de
  promoção.

O status detalhado e suas evidências vivem exclusivamente em
[`09_multimodal_expansion/00_INDEX.md`](09_multimodal_expansion/00_INDEX.md).

## Princípios de documentação

1. Diferenciar comportamento implementado, experimento pendente e proposta.
2. Não apresentar EEG, gaze, pupila ou saídas de modelo como diagnóstico ou
   evidência causal.
3. Registrar versão, checksum, unidade, origem, qualidade e transformação dos
   artefatos científicos.
4. Manter exemplos de portas e variáveis coerentes com o Compose e com
   `app/core/config.py`.
5. Atualizar `MANIFEST.json` quando uma especificação canônica for adicionada.
