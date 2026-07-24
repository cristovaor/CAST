# Fase 3 — Protocolo de Avaliação do Modelo

## 1. Objetivo

Evitar avaliação enganosa. O modelo deve ser avaliado em múltiplos níveis, porque acertar contagem agregada não significa acertar o frame exato.

## 2. Níveis de avaliação

| Nível | Pergunta | Métricas |
|---|---|---|
| Frame-level | o frame foi classificado corretamente? | precision, recall, F1, AUC, confusion matrix |
| Event-level | o evento foi detectado no intervalo correto? | event precision/recall/F1 com tolerância |
| Descriptor-level | a contagem por vídeo ficou próxima? | MAE, MAPE, erro relativo |
| Educational-level | microações se relacionam com ganho? | correlação, regressão, intervalo de confiança |
| Product-level | o usuário toma decisão útil? | tempo de análise, satisfação, revisão humana |

## 3. Estratégia de validação

Para replicar a dissertação:

```text
leave-one-video-out:
para cada vídeo i:
  treino = todos os vídeos exceto i
  teste = vídeo i
  treinar classificador por microação
  gerar predição no vídeo i
agregar resultados nas 9 iterações
```

Para produto:

- split por participante, nunca por frame aleatório;
- validação temporal opcional;
- holdout institucional quando houver múltiplas instituições;
- avaliação separada por qualidade de vídeo, óculos, iluminação, gênero/idade quando disponível e permitido.

## 4. Métricas frame-level

Para cada microação binária:

```text
precision = TP / (TP + FP)
recall = TP / (TP + FN)
F1 = 2 * precision * recall / (precision + recall)
```

Acurácia não deve ser métrica principal devido ao desbalanceamento.

## 5. Métricas event-level

Um evento previsto é verdadeiro positivo se:

```text
action_pred == action_true
AND overlap_temporal >= 1 frame
AND abs(start_pred - start_true) <= tolerance_frames OU IoU >= threshold
```

Configuração inicial:

```text
tolerance_ms = 500
min_iou = 0.10
```

## 6. Métricas descriptor-level

Usar contagens após colapso de positivos consecutivos.

```text
relative_error_action = abs(predicted_count - annotated_count) / max(annotated_count, 1)
```

Relatar por vídeo e por ação.

## 7. Métricas educacionais

Variáveis possíveis:

- contagem OF, OC, ML, VR;
- contagem por minuto;
- proporção de tempo em cada microação;
- taxa de eventos por segmento da aula;
- pré-teste;
- pós-teste;
- ganho absoluto;
- ganho relativo;
- tipo da aula: R/NR.

Modelos estatísticos iniciais:

- Spearman para associação monotônica;
- Mann-Whitney/Wilcoxon para grupos pequenos;
- regressão robusta quando N crescer;
- mixed-effects model se houver múltiplas sessões por aluno.

## 8. Relatório padrão

Cada avaliação deve gerar:

```json
{
  "dataset_version": "cast-1.0.0",
  "model_version": "cast-lstm-v1",
  "pipeline_version": "pipeline-1.0.0",
  "split_strategy": "leave-one-video-out",
  "metrics": {
    "frame_level": {},
    "event_level": {},
    "descriptor_level": {},
    "educational_level": {}
  },
  "limitations": []
}
```

## 9. Critérios mínimos para promover modelo

| Critério | Valor inicial |
|---|---:|
| F1 event-level OF | >= 0.60 |
| F1 event-level OC | >= 0.60 |
| Erro relativo descriptor OF | <= 15% |
| Erro relativo descriptor OC | <= 20% |
| Kappa anotadores | >= 0.70 |
| Teste em vídeos holdout | obrigatório |

## 10. Alertas

- Não comparar modelos usando frames aleatórios do mesmo vídeo no treino e teste.
- Não vender erro relativo agregado como acurácia individual.
- Não usar correlação educacional como causalidade.
- Não treinar com anotações sem concordância mínima.
