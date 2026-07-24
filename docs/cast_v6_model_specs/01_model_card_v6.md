# 01 — Model Card: CAST LSTM V6

## Identificação

| Campo | Valor |
|---|---|
| Nome do modelo | `cast-lstm-v6` |
| Família | LSTM temporal para microações faciais |
| Tipo de tarefa | Classificação binária por microação |
| Entrada | Sequência de landmarks faciais normalizados |
| Saída | Probabilidade de `NEUTRO` versus `AÇÃO` |
| Unidade de predição | Janela temporal de 7 frames |
| Framework original | TensorFlow/Keras |
| Fonte | Notebooks `MODELO_LSTM_V6.ipynb`, `CompactadorDados.ipynb`, `PLOT_PREVISOES.ipynb` |

## Escopo

O modelo V6 detecta microações faciais a partir de sequências de pontos faciais extraídos previamente.

O modelo **não deve** ser apresentado como detector direto de carga cognitiva. Ele produz sinais intermediários de microações, que podem ser usados em análises estatísticas posteriores.

## Microações contempladas

A estrutura do notebook suporta as seguintes ações:

| Código | Coluna do dataset | Observação |
|---|---|---|
| `OF` | `OLHO_FECHADO` | Caminho mais implementado no notebook de treino |
| `OC` | `OLHANDO_PARA_CANTO` | Fortemente usado no notebook de plots/avaliação |
| `ML` | `MEXEU_LABIOS` | Suportado por mapeamento de features |
| `VR` | `VIROU_ROSTO` | Suportado por mapeamento de features |
| `MSO` | `MEXEU_SOBRANCELHA` | Presente no dataset, mas não deve entrar como modelo V6 principal sem revisão |
| `NEUTRO` | `NEUTRO` | Classe negativa/referência |

## Arquitetura V6 observada

### V6 raw/final observada no notebook

```python
model = Sequential()
model.add(TimeDistributed(Dense(64, activation="relu"), input_shape=(7, features)))
model.add(LSTM(64, return_sequences=True, activation="relu"))
model.add(LSTM(32, return_sequences=True, activation="relu"))
model.add(LSTM(16, activation="relu"))
model.add(Dense(2, activation="sigmoid"))
model.compile(
    Adam(learning_rate=0.00010548643264689491),
    loss=CategoricalCrossentropy(),
    metrics=["mse", "mae", CategoricalCrossentropy, Precision, Recall, AUC]
)
```

### Arquitetura recomendada para API

Trocar a camada final para `softmax` quando a saída for mutuamente exclusiva (`NEUTRO` versus `AÇÃO`):

```python
model = Sequential([
    TimeDistributed(Dense(64, activation="relu"), input_shape=(7, features)),
    LSTM(64, return_sequences=True, activation="relu"),
    LSTM(32, return_sequences=True, activation="relu"),
    LSTM(16, activation="relu"),
    Dense(2, activation="softmax"),
])
```

## Shapes esperados

### Modelo `OF` observado

O caminho principal do notebook usa `modelo_olho_fechado`, com olhos direito e esquerdo:

```text
Olho direito: 16 pontos
Olho esquerdo: 16 pontos
Total: 32 pontos
Coordenadas: X, Y
Features: 64
Shape de entrada: (batch, 7, 64)
Shape de saída: (batch, 2)
```

### V6 PCA/Scaled alternativo

Quando usado StandardScaler + PCA(50):

```text
Shape de entrada: (batch, 7, 50)
Parâmetros aproximados: 51.874
```

### V6 raw/final

Quando usado landmarks normalizados brutos:

```text
Shape de entrada para OF: (batch, 7, 64)
Parâmetros aproximados: 52.770
```

## Hiperparâmetros observados

| Parâmetro | Valor |
|---|---|
| Épocas | `40` |
| Batch size | `34` |
| Learning rate | `0.00010548643264689491` |
| Otimizador | `Adam` |
| Loss | `CategoricalCrossentropy` |
| Early stopping | `monitor="val_loss", patience=5, mode="min"` |
| Checkpoint | `ModelCheckpoint("modelo.h5", monitor="val_loss", save_best_only=True)` |
| Validação | Leave-one-video-out, usando 9 cenários |
| Classe alvo | Binária: `NEUTRO` vs `AÇÃO` |
| Métricas | MSE, MAE, CategoricalCrossentropy, Precision, Recall, AUC |

## Estratégia de validação

O notebook usa 9 cenários:

```text
Cenário 0: treina com vídeos 2..9, testa com vídeo 1
Cenário 1: treina com vídeos exceto 2, testa com vídeo 2
...
Cenário 8: treina com vídeos 1..8, testa com vídeo 9
```

Na API, essa ideia deve virar:

```text
fold_id = video_id_deixado_para_teste
split_strategy = leave_one_video_out
```

## Limitações

1. A última célula de treino usa `sigmoid` com `CategoricalCrossentropy`, combinação inconsistente para classe binária mutuamente exclusiva.
2. Há caminho duplicado com `softmax`; para produção, preferir `softmax`.
3. A versão com PCA ajusta scaler/PCA no teste separadamente; isso não deve ser mantido em produção.
4. Os pesos de classe calculados por cenário não são armazenados corretamente para cada fold no loop final.
5. O notebook salva modelos com nomes genéricos `modelo_0.tf` ... `modelo_8.tf`, sem metadados.
6. A predição usa `argmax`; portanto, `softmax` é mais coerente que `sigmoid`.
7. A janela usa 7 frames de entrada e rótulo em `window_end`, isto é, tecnicamente prevê o frame imediatamente posterior à janela, não o último frame da janela.

## Recomendação

Registrar três modos de compatibilidade:

| Modo | Uso |
|---|---|
| `compat_raw_sigmoid` | Reproduzir a última execução do notebook |
| `compat_scaled_pca_softmax` | Comparar com o caminho PCA/Scaled |
| `canonical_softmax` | Treinamento e serving no CAST Pro |
