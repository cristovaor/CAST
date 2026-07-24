# 03 — Training Spec V6

## Objetivo

Converter o notebook `MODELO_LSTM_V6.ipynb` em uma especificação de treinamento reprodutível para o CAST Pro.

## Pipeline de treino

```text
1. Carregar dataset versionado
2. Validar arquivos de landmarks e microações
3. Selecionar microação
4. Selecionar features da região facial correspondente
5. Criar folds leave-one-video-out
6. Criar janelas temporais de 7 frames
7. Codificar alvo binário
8. Calcular pesos de classe por fold
9. Treinar modelo LSTM
10. Avaliar frame-level
11. Pós-processar eventos
12. Avaliar event-level/descriptor-level
13. Registrar modelo, métricas e artefatos
```

## Split

O notebook usa 9 vídeos e validação leave-one-video-out.

### Regra

Para cada `test_video_id`:

```python
train_videos = all_videos - {test_video_id}
test_video = test_video_id
```

### Manifesto do split

Cada execução deve salvar:

```json
{
  "split_strategy": "leave_one_video_out",
  "fold_id": "video_1",
  "train_video_ids": ["video_2", "video_3"],
  "test_video_ids": ["video_1"]
}
```

## Seleção de microação

O notebook contém `model_mapping`:

```python
model_mapping = {
  "modelo_olho_fechado": (
    ["NEUTRO","MEXEU_LABIOS","MEXEU_SOBRANCELHA","OLHANDO_PARA_CANTO","VIROU_ROSTO"],
    "OLHO_FECHADO"
  ),
  "modelo_olhando_canto": (
    ["NEUTRO","MEXEU_LABIOS","MEXEU_SOBRANCELHA","OLHO_FECHADO","VIROU_ROSTO"],
    "OLHANDO_PARA_CANTO"
  ),
  "modelo_mexeu_labios": (
    ["NEUTRO","OLHANDO_PARA_CANTO","MEXEU_SOBRANCELHA","OLHO_FECHADO","VIROU_ROSTO"],
    "MEXEU_LABIOS"
  ),
  "face_parts": (
    ["NEUTRO","OLHANDO_PARA_CANTO","MEXEU_SOBRANCELHA","OLHO_FECHADO","MEXEU_LABIOS"],
    "VIROU_ROSTO"
  )
}
```

## Janela temporal

Função observada:

```python
def split_series(series, n_past, n_future, drop):
    X = series.drop(action_columns, axis=1).values
    Y = series.iloc[:, -6:].drop(drop, axis=1).values

    X1, y1 = [], []

    for window_start in range(len(series) - n_past):
        window_end = window_start + n_past
        X_window = X[window_start:window_end, :]
        y_window = Y[window_end, :]
        X1.append(X_window)
        y1.append(y_window)

    return np.array(X1), np.array(y1)
```

### Interpretação crítica

Com `n_past=7`, o modelo recebe frames:

```text
t, t+1, t+2, t+3, t+4, t+5, t+6
```

E usa como rótulo:

```text
t+7
```

Portanto, o notebook faz **predição do próximo frame após a janela**, não classificação do último frame da janela.

### Decisão para produção

Definir duas opções:

#### Compatibilidade V6

```text
label_index = window_start + 7
```

Usar se o objetivo for reproduzir o notebook.

#### Correção científica recomendada

```text
label_index = window_start + 6
```

Usar se o objetivo for classificar o último frame da sequência de 7 frames.

A decisão deve ser registrada no manifesto:

```json
{
  "window_size": 7,
  "label_policy": "next_frame_after_window"
}
```

## Codificação de alvo

O notebook usa:

```python
df_teste_Y = to_categorical(df_teste_Y)
df_treino_Y = to_categorical(df_treino_Y)
```

A saída esperada é:

```text
0 -> NEUTRO/sem ação
1 -> AÇÃO
```

Shape:

```text
y.shape = (n_samples, 2)
```

## Pesos de classe

O notebook calcula pesos por fold com:

```python
class_weight.compute_class_weight(
    class_weight="balanced",
    classes=np.unique(df_treino_y.values),
    y=df_treino_y.values
)
```

### Correção obrigatória

No notebook, `pesos` não é armazenado por cenário na lista `dados_treino_scaled`; no loop final, há risco de usar o último `pesos` para todos os folds.

No novo sistema:

```python
fold.class_weight = compute_class_weight_for_fold(fold.train_y)
```

E passar o peso correto no `model.fit()` daquele fold.

## Arquitetura recomendada

```python
def build_lstm_v6(input_shape, learning_rate):
    model = Sequential([
        TimeDistributed(Dense(64, activation="relu"), input_shape=input_shape),
        LSTM(64, return_sequences=True, activation="relu"),
        LSTM(32, return_sequences=True, activation="relu"),
        LSTM(16, activation="relu"),
        Dense(2, activation="softmax"),
    ])

    model.compile(
        optimizer=Adam(learning_rate=learning_rate),
        loss=CategoricalCrossentropy(),
        metrics=[
            "mse",
            "mae",
            metrics.CategoricalCrossentropy(name="CategoricalCrossEntropy"),
            metrics.Precision(name="precision"),
            metrics.Recall(name="recall"),
            metrics.AUC(name="AUC"),
        ],
    )

    return model
```

## Hiperparâmetros

```yaml
model_family: cast-lstm-v6
epochs: 40
batch_size: 34
learning_rate: 0.00010548643264689491
early_stopping:
  monitor: val_loss
  patience: 5
  mode: min
checkpoint:
  monitor: val_loss
  save_best_only: true
optimizer: Adam
loss: categorical_crossentropy
activation_hidden: relu
activation_output: softmax
```

## Modo PCA/Scaled

O notebook possui uma variação:

```python
scaler = StandardScaler()
df_treino_X_scaled = scaler.fit_transform(df_treino_X)
df_teste_X_scaled = scaler.fit_transform(df_teste_X)

pca = PCA(n_components=50)
df_treino_X_pca = pca.fit_transform(df_treino_X_scaled)
df_teste_X_pca = pca.fit_transform(df_teste_X_scaled)
```

### Problema

O teste usa `fit_transform`, o que cria outro scaler/PCA no conjunto de teste. Isso torna treino e teste incompatíveis.

### Correção

```python
scaler.fit(train_X)
train_X_scaled = scaler.transform(train_X)
test_X_scaled = scaler.transform(test_X)

pca.fit(train_X_scaled)
train_X_pca = pca.transform(train_X_scaled)
test_X_pca = pca.transform(test_X_scaled)
```

Além disso, `scaler` e `pca` devem ser salvos como artefatos do modelo.

## Artefatos de saída do treino

Para cada ação e fold:

```text
models/
  cast-lstm-v6/
    OF/
      fold_video_1/
        model.keras
        manifest.json
        feature_columns.json
        metrics.json
        class_weights.json
        confusion_matrix.json
        training_history.json
```

Se usar PCA:

```text
        scaler.joblib
        pca.joblib
```

## Comando CLI esperado

```bash
python -m cast_ml.train_lstm_v6 \
  --dataset-id dataset_cast_v6_001 \
  --action OF \
  --mode canonical_softmax \
  --split leave_one_video_out \
  --epochs 40 \
  --batch-size 34 \
  --learning-rate 0.00010548643264689491 \
  --output-dir artifacts/models/cast-lstm-v6
```

## Critérios de aceite do treino

- Treina pelo menos um fold sem erro.
- Salva modelo e manifesto.
- Salva feature order.
- Salva métricas frame-level.
- Salva matriz de confusão.
- Salva pesos de classe por fold.
- Salva configuração de janela e política de rótulo.
- Permite reproduzir a mesma execução com `run_id`.
- Não usa caminhos absolutos locais.
- Não usa `globals()` para pipeline de produção.
- Não usa `fit_transform` no conjunto de teste.
