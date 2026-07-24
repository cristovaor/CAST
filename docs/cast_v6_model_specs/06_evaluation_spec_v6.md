# 06 — Evaluation Spec V6

## Objetivo

Definir como avaliar os modelos V6 em múltiplos níveis: frame, evento, descritor e operação.

## Métricas observadas nos notebooks

Os notebooks usam:

- `confusion_matrix`
- `classification_report`
- `precision`
- `recall`
- `f1-score`
- `support`
- `MSE`
- `MAE`
- `CategoricalCrossentropy`
- `AUC`
- matriz de confusão por cenário
- comparação de soma entre `ORIGINAL` e `PREVISAO`

## Níveis de avaliação

### 1. Frame-level

Pergunta:

```text
O modelo acerta o rótulo por frame/janela?
```

Métricas:

- accuracy;
- precision;
- recall;
- f1-score;
- AUC;
- matriz de confusão;
- suporte por classe.

### 2. Event-level

Pergunta:

```text
O modelo detecta eventos de microação com tolerância temporal aceitável?
```

Métricas:

- event precision;
- event recall;
- event F1;
- erro de início;
- erro de fim;
- IoU temporal;
- tolerância de ±N frames.

### 3. Descriptor-level

Pergunta:

```text
A contagem final de eventos por vídeo fica próxima da anotação humana?
```

Métricas:

- erro absoluto;
- erro relativo;
- MAPE;
- diferença de eventos por minuto.

### 4. Operational-level

Pergunta:

```text
O pipeline é útil e confiável para o CAST Pro?
```

Métricas:

- tempo de inferência por vídeo;
- taxa de falha;
- taxa de landmarks válidos;
- latência;
- throughput;
- uso de CPU/GPU.

## Avaliação leave-one-video-out

Para cada fold:

```text
train: 8 vídeos
test: 1 vídeo
```

Salvar:

```json
{
  "fold_id": "video_1",
  "test_video_id": "video_1",
  "metrics": {
    "frame_level": {},
    "event_level": {},
    "descriptor_level": {}
  }
}
```

## Relatório de matriz de confusão

Formato:

```json
{
  "labels": ["NEUTRO", "ACAO"],
  "matrix": [
    [TN, FP],
    [FN, TP]
  ]
}
```

## Relatório classification_report

Formato:

```json
{
  "NEUTRO": {
    "precision": 0.95,
    "recall": 0.91,
    "f1_score": 0.92,
    "support": 5242
  },
  "ACAO": {
    "precision": 0.08,
    "recall": 0.13,
    "f1_score": 0.10,
    "support": 315
  },
  "accuracy": 0.86,
  "macro_avg": {},
  "weighted_avg": {}
}
```

## Resultados observados relevantes

O notebook `MODELO_LSTM_V6.ipynb` mostra grande variação entre cenários.

Exemplos do caminho raw/final:

| Cenário | Observação |
|---:|---|
| 1 | accuracy alta, mas baixa precisão para ação em algumas execuções |
| 2 | forte instabilidade por desbalanceamento |
| 7 | desempenho alto em uma execução para ação positiva |
| 8 | comportamento com muitos falsos positivos em uma execução |
| 9 | alta recall para ação positiva em uma execução |

O notebook `PLOT_PREVISOES.ipynb` compara `ORIGINAL` e `PREVISAO`, especialmente para `OLHANDO_PARA_CANTO`, com contagens por cenário:

| Cenário | Original | Previsão |
|---:|---:|---:|
| 1 | 67 | 68 |
| 2 | 100 | 139 |
| 3 | 292 | 291 |
| 4 | 302 | 302 |
| 5 | 142 | 121 |
| 6 | 106 | 191 |
| 7 | 99 | 150 |
| 8 | 300 | 300 |
| 9 | 226 | 226 |

Isso indica que a avaliação por contagem pode parecer boa em alguns cenários mesmo quando o frame-level não é perfeito. Por isso, os níveis de avaliação devem ficar separados.

## Plots obrigatórios

Para cada ação e fold:

- matriz de confusão absoluta;
- matriz de confusão percentual;
- curva de perda;
- curva de AUC;
- curva de precision/recall;
- timeline original vs predição;
- histograma de confiança;
- eventos compactados original vs predição.

## Artefatos

```text
evaluation/
  {action}/
    fold_video_1/
      classification_report.json
      confusion_matrix.json
      confusion_matrix.png
      training_curves.png
      timeline_original_vs_prediction.png
      descriptor_metrics.json
```

## Critérios mínimos de promoção

Não promover modelo para produção apenas por accuracy.

Critérios recomendados:

```yaml
promotion_criteria:
  frame_level:
    action_f1_min: 0.60
    action_recall_min: 0.60
    macro_f1_min: 0.65
  descriptor_level:
    relative_error_mean_max: 0.25
  operational:
    failed_jobs_rate_max: 0.05
```

Esses limites são iniciais e devem ser calibrados com mais dados.

## Alertas

- Microações são desbalanceadas; accuracy isolada é enganosa.
- O modelo pode aprender características individuais dos 9 vídeos.
- Leave-one-video-out ajuda, mas não substitui validação externa.
- Deve haver validação com novos participantes antes de qualquer uso amplo.
