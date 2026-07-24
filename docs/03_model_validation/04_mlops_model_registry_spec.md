# Fase 3 — Especificação de MLOps e Model Registry

## 1. Objetivo

Garantir que qualquer predição seja rastreável até código, dados, modelo, thresholds e ambiente.

## 2. Entidades

| Entidade | Descrição |
|---|---|
| dataset_version | versão do conjunto de dados/anotações |
| model_version | versão dos pesos/arquitetura |
| pipeline_version | versão do pré-processamento/inferência |
| threshold_set | thresholds por microação |
| evaluation_run | execução de avaliação |
| training_run | execução de treino |

## 3. Nomeação

```text
model_version = cast-lstm-{major}.{minor}.{patch}
example: cast-lstm-1.0.0
```

## 4. Metadados obrigatórios do modelo

```json
{
  "model_version": "cast-lstm-1.0.0",
  "architecture": "TimeDistributed(Dense64)+LSTM32+LSTM16+LSTM16+Dense2",
  "actions": ["OF", "OC", "ML", "VR"],
  "dataset_version": "cast-1.0.0",
  "training_code_commit": "git-sha",
  "python_version": "3.11",
  "tensorflow_version": "2.x",
  "mediapipe_version": "x.y.z",
  "input_window_frames": 7,
  "feature_schema_version": "facemesh-region-norm-v1",
  "created_at": "timestamp",
  "metrics": {},
  "limitations": []
}
```

## 5. Estágios do modelo

```text
EXPERIMENTAL → VALIDATED → STAGING → PRODUCTION → RETIRED
```

Promoção para `PRODUCTION` exige:

- avaliação em holdout;
- documentação de dataset;
- métricas mínimas;
- revisão técnica;
- revisão ética/LGPD.

## 6. Armazenamento

```text
s3://cast-models/{env}/cast-lstm-1.0.0/
  model_OF.keras
  model_OC.keras
  model_ML.keras
  model_VR.keras
  metadata.json
  thresholds.json
  feature_schema.json
  evaluation_report.json
```

## 7. Thresholds

Cada microação deve ter threshold versionado:

```json
{
  "threshold_set_version": "thresholds-1.0.0",
  "OF": 0.50,
  "OC": 0.50,
  "ML": 0.50,
  "VR": 0.50
}
```

## 8. Experimentos

Ferramenta recomendada: MLflow ou registry próprio simples no PostgreSQL + S3.

Métricas mínimas por run:

- precision/recall/F1 por ação;
- confusion matrix;
- erro relativo descriptor-level;
- dataset hash;
- número de vídeos;
- número de eventos por classe;
- tempo de treino.

## 9. Reprodutibilidade

Registrar:

- seeds;
- versões de bibliotecas;
- hash dos dados;
- configuração de GPU/CPU;
- commit do código;
- arquivo de configuração YAML do treino.

## 10. Critério de aceite

- [ ] nenhuma predição sem model_version;
- [ ] nenhum relatório sem dataset_version;
- [ ] pesos e thresholds imutáveis por versão;
- [ ] rollback possível para versão anterior;
- [ ] avaliação comparativa antes de promoção.
