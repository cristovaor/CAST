# CAST Pro — Especificações do Modelo LSTM V6

## Objetivo

Este pacote documenta a versão **V6** dos notebooks enviados:

- `CompactadorDados.ipynb`
- `MODELO_LSTM_V6.ipynb`
- `PLOT_PREVISOES.ipynb`

O objetivo é transformar o experimento em especificação operacional para o novo sistema CAST Pro, cobrindo:

1. contrato de dados;
2. treinamento;
3. inferência via API;
4. pós-processamento;
5. avaliação;
6. versionamento de modelos;
7. correções obrigatórias antes de produção.

## Decisão técnica principal

Os notebooks V6 contêm **mais de um caminho experimental**:

| Caminho | Origem | Características | Status recomendado |
|---|---|---|---|
| `v6_scaled_pca_softmax` | `MODELO_LSTM_V6.ipynb`, célula de treino "Modelo Scaled" | StandardScaler + PCA(50) + LSTM + softmax | Útil para comparação, mas exige salvar scaler e PCA por fold/modelo |
| `v6_raw_sigmoid` | `MODELO_LSTM_V6.ipynb`, última célula de treino executada | Pontos normalizados brutos + LSTM + sigmoid | Compatibilidade com execução final do notebook, mas tem inconsistência conceitual |
| `v6_canonical_api` | especificação proposta neste pacote | Pontos normalizados brutos + LSTM + softmax + registry | Recomendado para API e produção |

## Veredito

Para o novo sistema, não basta copiar o notebook. O notebook deve ser convertido para pipeline modular com:

```text
datasets -> preprocessing -> windowing -> train -> evaluate -> register -> serve -> monitor
```

A versão mais segura para produção é:

```text
v6_canonical_api
- entrada: landmarks normalizados por frame
- janela: 7 frames
- saída: classe binária por microação
- ativação final: softmax
- loss: categorical_crossentropy
- registro obrigatório de modelo, features, classes e threshold
```

## Artefatos deste pacote

```text
01_model_card_v6.md
02_data_contract_v6.md
03_training_spec_v6.md
04_inference_api_spec_v6.md
05_postprocessing_and_compaction_v6.md
06_evaluation_spec_v6.md
07_model_registry_and_artifacts_v6.md
08_known_issues_and_corrections_v6.md
09_implementation_plan_v6.md
10_acceptance_checklist_v6.md
```

## Premissas

- O sistema já possui backend em Python/FastAPI.
- O frontend React consumirá resultados via API.
- O pipeline de FaceMesh/MediaPipe já extrai os pontos e salva dados normalizados.
- O modelo V6 será usado para microações faciais, não para diagnóstico direto de carga cognitiva.
- Cada predição deve sempre carregar metadados de modelo, versão, ação, fold/cenário e qualidade do dado.

## Decisão de nomenclatura

Usar nomes de microações padronizados:

| Código | Nome técnico | Nome exibido |
|---|---|---|
| `OF` | `OLHO_FECHADO` | Olho fechado |
| `OC` | `OLHANDO_PARA_CANTO` | Olhando para canto |
| `ML` | `MEXEU_LABIOS` | Mexeu lábios |
| `VR` | `VIROU_ROSTO` | Virou rosto |
| `NEUTRAL` | `NEUTRO` | Neutro |

## Ponto crítico

A V6 atual, como notebook, **não é um artefato de produção**. Ela contém caminhos duplicados, inconsistências e riscos de reprodutibilidade. Este pacote especifica como transformar a V6 em componente treinável e servível no CAST Pro.
