# Especificação de Replicação do Modelo CAST

**Sistema:** CAST — Cognitive Analysis System  
**Escopo:** replicação do pipeline de detecção de microações faciais em vídeos de aprendizagem multimídia.  
**Origem técnica:** dissertação de mestrado “Detecção de microações em vídeos faciais para análise de carga cognitiva em ambientes de aprendizado multimídia”, Cristóvão da Silva Rodrigues Costa, UFAL, 2023.  
**Uso recomendado:** base para implementação backend Python/FastAPI, workers de processamento, reprodutibilidade experimental e futura profissionalização do sistema.

---

## 1. Veredito de replicabilidade

A dissertação permite reconstruir o pipeline central, mas **não contém todos os detalhes necessários para uma reprodução bit-a-bit**. O documento informa a metodologia, arquitetura geral, regiões faciais, estratégia de treino e métricas. Porém, faltam detalhes operacionais como versões exatas das bibliotecas, seeds, callbacks completos, inicializadores, código efetivo de pré-processamento, formato final dos arquivos e pesos treinados.

Portanto, esta especificação separa três níveis:

| Nível | Objetivo | Status |
|---|---|---|
| Replicação conceitual | Reproduzir a metodologia e arquitetura descritas | Viável |
| Replicação experimental aproximada | Obter métricas próximas usando mesma base/anotações | Viável se os dados originais existirem |
| Replicação exata | Reproduzir pesos, métricas e resultados idênticos | Não garantida sem código/dados/seeds originais |

**Decisão técnica:** implementar o pipeline com rastreabilidade forte, versionamento de dados/modelos e testes automatizados. O objetivo inicial deve ser “reproduzir os descritores de microações e os erros relativos reportados”, não “detectar carga cognitiva clinicamente”.

---

## 2. Objetivo do modelo

O pipeline detecta microações faciais em vídeos de estudantes assistindo aulas multimídia. A saída principal não é uma emoção nem uma classe direta de carga cognitiva. A saída é um **descritor de vídeo** contendo a contagem de ocorrências de microações.

Formalmente, para cada vídeo `Vi`, o sistema gera:

```text
δi = (c_OF, c_OC, c_ML, c_VR)
```

Onde:

| Símbolo | Microação |
|---|---|
| `OF` | Olho fechado |
| `OC` | Olhando para canto/lado |
| `ML` | Mexeu lábios |
| `VR` | Virou rosto |

Depois, esse descritor pode ser usado em análises estatísticas com ganho de aprendizagem, tipo de aula e outros indicadores.

---

## 3. Fluxo completo do pipeline

```text
Vídeo MP4
  ↓
Extração de frames
  ↓
Detecção facial e landmarks com MediaPipe FaceMesh
  ↓
Seleção de pontos por região facial
  ↓
Normalização espacial por região
  ↓
Geração de janelas deslizantes de 7 frames
  ↓
Classificadores binários LSTM por microação
  ↓
Predição frame a frame
  ↓
Colapso de previsões consecutivas positivas
  ↓
Descritor do vídeo: contagem de ocorrências por microação
  ↓
Métricas, dashboard e análise estatística
```

---

## 4. Dados originais do experimento

### 4.1 Dataset bruto

| Item | Valor reportado |
|---|---|
| Participantes iniciais | 13 alunos |
| Origem | Faculdade de Medicina da Universidad de Atacama, Chile |
| Tipo de vídeo | Face do estudante assistindo aula na tela do computador |
| Duração média | 3 minutos |
| Resolução | 1920 × 1080 |
| Formato | MP4 |
| Tamanho médio | ~400 MB por vídeo |
| Grupos | Aula não redundante `NR` e aula redundante `R` |

### 4.2 Filtro de qualidade

Dos 13 vídeos iniciais:

- 2 foram removidos por baixa qualidade de gravação;
- 2 foram removidos por uso de máscara facial;
- restaram 9 vídeos para os classificadores de microações.

### 4.3 Vídeos usados na replicação experimental

| ID interno | Vídeo/aluno original | Tipo | Ganho de aprendizagem | Variação |
|---|---:|---|---:|---:|
| `#1` | 4 | R | 8.5 | 60.71% |
| `#2` | 5 | NR | 8.9 | 63.57% |
| `#3` | 6 | NR | 3.0 | 21.43% |
| `#4` | 7 | NR | 7.2 | 51.43% |
| `#5` | 8 | R | 8.0 | 57.14% |
| `#6` | 10 | R | 4.2 | 30.00% |
| `#7` | 11 | NR | 7.3 | 52.14% |
| `#8` | 12 | R | 4.0 | 28.57% |
| `#9` | 13 | R | 9.5 | 67.68% |

### 4.4 Contagem de microações anotadas manualmente

| Vídeo | OF | OC | ML | VR |
|---|---:|---:|---:|---:|
| `#1` | 70 | 165 | 2 | 0 |
| `#2` | 77 | 99 | 7 | 0 |
| `#3` | 38 | 237 | 7 | 1 |
| `#4` | 150 | 242 | 2 | 0 |
| `#5` | 84 | 158 | 0 | 0 |
| `#6` | 126 | 201 | 1 | 0 |
| `#7` | 77 | 205 | 3 | 0 |
| `#8` | 96 | 238 | 1 | 0 |
| `#9` | 73 | 174 | 0 | 0 |
| **Total** | **791** | **1719** | **23** | **1** |

**Ponto crítico:** `VR` tem apenas 1 ocorrência anotada no conjunto. Qualquer métrica perfeita para essa ação deve ser tratada com cautela estatística.

---

## 5. Estrutura recomendada de diretórios

```text
cast-replication/
  README.md
  pyproject.toml
  requirements.lock
  .env.example

  data/
    raw/
      videos/
        video_001.mp4
        video_002.mp4
      metadata/
        videos.csv
        participants.csv
    annotations/
      frame_labels.csv
    interim/
      frames_index.parquet
      landmarks_raw.parquet
      landmarks_normalized.parquet
    processed/
      windows/
        OF_fold_01_train.npz
        OF_fold_01_test.npz
      descriptors/
        groundtruth_descriptors.csv
        predicted_descriptors.csv

  models/
    manifests/
      OF_model_manifest.yaml
      OC_model_manifest.yaml
      ML_model_manifest.yaml
      VR_model_manifest.yaml
    checkpoints/
      OF_fold_01.keras
      OC_fold_01.keras
    exported/
      OF_v1.keras
      OC_v1.keras
      ML_v1.keras
      VR_v1.keras

  reports/
    metrics/
      fold_metrics.csv
      descriptor_errors.csv
    figures/
      tsne/
      confusion_matrices/

  src/
    cast/
      config/
        landmarks.py
        actions.py
        settings.py
      io/
        videos.py
        annotations.py
        datasets.py
      vision/
        frame_extractor.py
        facemesh_extractor.py
        normalization.py
      features/
        regions.py
        windowing.py
        descriptors.py
      models/
        lstm_classifier.py
        training.py
        inference.py
        evaluation.py
      experiments/
        leave_one_video_out.py
        reproduce_paper.py
      api/
        main.py

  tests/
    test_landmark_regions.py
    test_normalization.py
    test_windowing.py
    test_descriptor_collapse.py
    test_model_shape.py
```

---

## 6. Ambiente computacional

### 6.1 Ambiente reportado na dissertação

| Item | Valor |
|---|---|
| Linguagem | Python |
| Bibliotecas citadas | Keras, Scikit-learn, OpenCV, Flask |
| CPU | Intel Core i7-7500U 2.7 GHz, 4 núcleos |
| RAM | 32 GB |
| GPU | NVIDIA GTX 1650 |
| Disco | 1.5 TB SSD |

### 6.2 Ambiente recomendado para replicação atual

Usar ambiente isolado e congelado:

```bash
python -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pip freeze > requirements.lock
```

`requirements.txt` recomendado para primeira implementação:

```text
numpy
pandas
scikit-learn
opencv-python
mediapipe
tensorflow
keras
matplotlib
pyarrow
pydantic
python-dotenv
fastapi
uvicorn
pytest
mlflow
```

**Atenção:** para replicação científica, não use “latest” em produção. Depois do primeiro run validado, congele o `requirements.lock` e use o mesmo arquivo em todos os experimentos.

---

## 7. Extração de landmarks com MediaPipe FaceMesh

### 7.1 Configuração mínima

A dissertação usa FaceMesh/MediaPipe para coletar pontos faciais enumerados de `0` a `468`, além de pontos de íris. Para usar índices de íris `469` a `477`, configure `refine_landmarks=True`.

Exemplo:

```python
import mediapipe as mp

mp_face_mesh = mp.solutions.face_mesh

face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=False,
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5,
)
```

**Assunção documentada:** a dissertação não fixa `min_detection_confidence` nem `min_tracking_confidence`. Use `0.5` como baseline e registre qualquer alteração no manifesto do experimento.

### 7.2 Contrato de saída dos landmarks

Para cada frame processado, salvar:

```text
video_id: str
frame_idx: int
timestamp_ms: float
face_detected: bool
landmark_idx: int
x: float
y: float
z: float | null
visibility: float | null
presence: float | null
```

Arquivo recomendado:

```text
data/interim/landmarks_raw.parquet
```

### 7.3 Regra para frames sem face detectada

Implementar política explícita:

| Situação | Ação recomendada |
|---|---|
| 1 a 2 frames sem face | interpolar linearmente se frames vizinhos existirem |
| >2 frames consecutivos sem face | marcar como inválido e excluir janelas que dependam desses frames |
| vídeo com baixa taxa de detecção | reprovar o vídeo para treino |

Métrica obrigatória:

```text
face_detection_rate = frames_com_face / total_frames
```

Critério recomendado para aceitar vídeo:

```text
face_detection_rate >= 0.95
```

---

## 8. Pontos FaceMesh por região facial

### 8.1 Tabela completa extraída da dissertação

```python
FACEMESH_REGIONS = {
    "sobrancelha_direita": [46, 53, 52, 65, 55, 70, 63, 105, 66, 107],
    "sobrancelha_esquerda": [276, 283, 282, 295, 285, 300, 293, 334, 296, 336],

    "olho_direito": [
        33, 7, 163, 144, 145, 153, 154, 155,
        133, 246, 161, 160, 159, 158, 157, 173,
    ],

    "olho_esquerdo": [
        263, 249, 390, 373, 374, 380, 381, 382,
        362, 466, 388, 387, 386, 385, 384, 398,
    ],

    "iris_direita": [469, 470, 471, 472],
    "iris_esquerda": [474, 475, 476, 477],

    "labios": [
        61, 146, 91, 181, 84, 17, 314, 405,
        321, 375, 291, 185, 40, 39, 37, 0,
        267, 269, 270, 409, 78, 95, 88, 178,
        87, 14, 317, 402, 318, 324, 308, 191,
        80, 81, 82, 13, 312, 311, 310, 415,
    ],

    "nariz": [
        168, 6, 197, 195, 5, 4, 1, 19,
        94, 2, 98, 97, 326, 327, 294, 278,
        344, 440, 275, 45, 220, 115, 48, 64, 98,
    ],

    "contorno_rosto": [
        10, 338, 297, 332, 284, 251, 389, 356,
        454, 323, 361, 288, 397, 365, 379, 378,
        400, 377, 152, 148, 176, 149, 150, 136,
        172, 58, 132, 93, 234, 127, 162, 21,
        54, 103, 67, 109, 10,
    ],
}
```

### 8.2 Conjunto padrão de 100 pontos

A dissertação informa que foram usados 100 pontos representados por coordenadas `x` e `y`, descartando `z`. A combinação que fecha exatamente 100 pontos é:

```text
sobrancelha_direita: 10
sobrancelha_esquerda: 10
olho_direito: 16
olho_esquerdo: 16
iris_direita: 4
iris_esquerda: 4
labios: 40
Total: 100 pontos
```

Configuração:

```python
DEFAULT_100_POINT_REGIONS = [
    "sobrancelha_direita",
    "sobrancelha_esquerda",
    "olho_direito",
    "olho_esquerdo",
    "iris_direita",
    "iris_esquerda",
    "labios",
]
```

**Ambiguidade importante:** o texto menciona “contornos faciais”, mas o conjunto que totaliza 100 pontos não comporta o contorno completo da Tabela 4.1. Para replicação, use os 100 pontos acima como padrão e trate nariz/contorno como extensão experimental, não como baseline.

---

## 9. Regiões por microação

A dissertação associa regiões de interesse a cada microação da seguinte forma:

| Microação | Regiões de interesse | Pontos | Features `x,y` |
|---|---|---:|---:|
| `OF` — Olho fechado | olho direito, olho esquerdo, íris direita, íris esquerda | 40 | 80 |
| `OC` — Olhando para canto | olho direito, olho esquerdo, íris direita, íris esquerda | 40 | 80 |
| `ML` — Mexeu lábios | lábios | 40 | 80 |
| `VR` — Virou rosto | olho direito, olho esquerdo, íris direita, íris esquerda, lábios | 80 | 160 |
| `NEUTRO` | olho direito, olho esquerdo, íris direita, íris esquerda, lábios | 80 | 160 |

Configuração recomendada:

```python
ACTION_REGIONS = {
    "OF": ["olho_direito", "olho_esquerdo", "iris_direita", "iris_esquerda"],
    "OC": ["olho_direito", "olho_esquerdo", "iris_direita", "iris_esquerda"],
    "ML": ["labios"],
    "VR": ["olho_direito", "olho_esquerdo", "iris_direita", "iris_esquerda", "labios"],
    "NEUTRO": ["olho_direito", "olho_esquerdo", "iris_direita", "iris_esquerda", "labios"],
}
```

---

## 10. Normalização espacial por região

### 10.1 Regra descrita

A normalização é feita por região facial, não globalmente no rosto inteiro. Para cada região `R`, calcular a bounding box 2D:

```text
xmin_R = min(x_i) para todos os pontos i em R
xmax_R = max(x_i) para todos os pontos i em R
ymin_R = min(y_i) para todos os pontos i em R
ymax_R = max(y_i) para todos os pontos i em R
```

Depois, normalizar:

```text
x_norm_i = (x_i - xmin_R) / (xmax_R - xmin_R)
y_norm_i = (y_i - ymin_R) / (ymax_R - ymin_R)
```

### 10.2 Tratamento de divisão por zero

Implementar proteção:

```python
EPS = 1e-8
x_norm = (x - x_min) / max(x_max - x_min, EPS)
y_norm = (y - y_min) / max(y_max - y_min, EPS)
```

### 10.3 Coordenada `z`

A coordenada `z` deve ser descartada no baseline, pois a dissertação informa que ela se mostrou irrelevante em experimentos preliminares.

### 10.4 Ambiguidade: unidade centrada na origem vs. fórmula

O texto descreve uma bounding box “unitária e centrada na origem”, mas a fórmula apresentada mapeia os pontos para `[0, 1]`, não para uma caixa centrada em `0`.

Para replicação, implemente dois modos:

```python
NORMALIZATION_MODE = "paper_formula"  # default
# paper_formula: [0, 1]
# centered: [-0.5, 0.5]
```

Implementação:

```python
def normalize_region(points, mode="paper_formula", eps=1e-8):
    xs = points[:, 0]
    ys = points[:, 1]

    x_min, x_max = xs.min(), xs.max()
    y_min, y_max = ys.min(), ys.max()

    x_norm = (xs - x_min) / max(x_max - x_min, eps)
    y_norm = (ys - y_min) / max(y_max - y_min, eps)

    if mode == "centered":
        x_norm = x_norm - 0.5
        y_norm = y_norm - 0.5

    return np.stack([x_norm, y_norm], axis=1)
```

**Baseline obrigatório:** `paper_formula`.

---

## 11. Formato das anotações manuais

As microações são anotadas por frame. Exemplo de contrato:

```text
video_id,frame_idx,NEUTRO,OF,OC,ML,VR
1,1,0,1,0,0,0
1,2,0,1,0,0,0
1,3,0,1,0,0,0
1,4,1,0,0,0,0
1,5,1,0,0,0,0
1,6,0,0,1,0,0
```

Arquivo recomendado:

```text
data/annotations/frame_labels.csv
```

### 11.1 Validação das anotações

Como a dissertação afirma que algumas ações podem ocorrer em conjunto, não imponha regra `one-hot` rígida. Valide assim:

```python
assert frame_idx >= 0
assert all(label in {0, 1} for label in [NEUTRO, OF, OC, ML, VR])
assert not (NEUTRO == 1 and (OF + OC + ML + VR) > 0)
```

Ou seja:

- ações podem coexistir entre si;
- `NEUTRO` não deve coexistir com ação positiva.

---

## 12. Geração de janelas temporais

### 12.1 Regra principal

Cada classificador recebe uma sequência de **7 frames consecutivos** e prediz se a microação ocorre no **último frame** da sequência.

Para um vídeo com `n_i` frames válidos:

```text
n_amostras = n_i - 6
```

Exemplo:

```text
Frames:  0 1 2 3 4 5 6 7 8 9
Janela: [0 1 2 3 4 5 6] -> target do frame 6
Janela: [1 2 3 4 5 6 7] -> target do frame 7
Janela: [2 3 4 5 6 7 8] -> target do frame 8
```

### 12.2 Contrato de entrada

Forma geral:

```python
X.shape = (n_amostras, 7, n_features)
y.shape = (n_amostras, 2)
```

Onde `y` é binário codificado para softmax:

```python
y = [1, 0]  # sem ação específica
y = [0, 1]  # com ação específica
```

### 12.3 Modo de features

Há uma tensão entre a Figura 4.9, que mostra entrada `(None, 7, 200)`, e a descrição textual, que admite número menor de features dependendo da região `Ra`.

Implemente dois modos:

#### Modo A — `strict_fig49`

Todos os classificadores usam os 100 pontos padrão:

```text
X.shape = (n_amostras, 7, 200)
```

Vantagem: replica a forma da arquitetura apresentada na Figura 4.9.  
Desvantagem: usa pontos que podem não estar na região de interesse de cada microação.

#### Modo B — `roi_features`

Cada classificador usa apenas sua região de interesse:

```text
OF: X.shape = (n_amostras, 7, 80)
OC: X.shape = (n_amostras, 7, 80)
ML: X.shape = (n_amostras, 7, 80)
VR: X.shape = (n_amostras, 7, 160)
```

Vantagem: replica melhor a descrição metodológica de usar `Ra`.  
Desvantagem: a forma exata difere da Figura 4.9.

**Baseline recomendado para reproduzir a dissertação:** rodar ambos os modos e declarar o resultado. Para o produto, usar `roi_features` por eficiência e menor ruído.

---

## 13. Arquitetura do classificador LSTM

### 13.1 Arquitetura reportada

A arquitetura da Figura 4.9 é:

```text
Input:                  (None, 7, 200)
TimeDistributed(Dense):  (None, 7, 64)
LSTM:                   (None, 7, 32)
LSTM:                   (None, 7, 16)
LSTM:                   (None, 16)
Dense softmax:          (None, 2)
```

### 13.2 Implementação Keras recomendada

```python
import tensorflow as tf
from tensorflow.keras import layers, models


def build_micro_action_lstm(
    n_features: int = 200,
    sequence_length: int = 7,
    dense_units: int = 64,
    lstm_units=(32, 16, 16),
    n_classes: int = 2,
    learning_rate: float = 0.00010548643264689491,
):
    model = models.Sequential(name="micro_action_lstm")

    model.add(layers.Input(shape=(sequence_length, n_features)))

    # A dissertação informa uma camada Dense aplicada em paralelo a cada frame.
    # A ativação dessa Dense não é explicitada na figura; ReLU é uma assunção prática.
    model.add(layers.TimeDistributed(
        layers.Dense(dense_units, activation="relu"),
        name="time_distributed_dense",
    ))

    model.add(layers.LSTM(
        lstm_units[0],
        activation="relu",
        return_sequences=True,
        name="lstm_1",
    ))

    model.add(layers.LSTM(
        lstm_units[1],
        activation="relu",
        return_sequences=True,
        name="lstm_2",
    ))

    model.add(layers.LSTM(
        lstm_units[2],
        activation="relu",
        return_sequences=False,
        name="lstm_3",
    ))

    model.add(layers.Dense(n_classes, activation="softmax", name="output"))

    optimizer = tf.keras.optimizers.Adam(learning_rate=learning_rate)

    model.compile(
        optimizer=optimizer,
        loss="categorical_crossentropy",
        metrics=["accuracy"],
    )

    return model
```

### 13.3 Manifesto do modelo

Cada modelo treinado deve gerar um arquivo YAML:

```yaml
model_name: OF_lstm
micro_action: OF
sequence_length: 7
feature_mode: roi_features
n_features: 80
landmark_regions:
  - olho_direito
  - olho_esquerdo
  - iris_direita
  - iris_esquerda
architecture:
  time_distributed_dense_units: 64
  lstm_units: [32, 16, 16]
  lstm_activation: relu
  output_units: 2
  output_activation: softmax
training:
  optimizer: adam
  learning_rate: 0.00010548643264689491
  batch_size: 34
  max_epochs: 40
  early_stopping: true
  class_weight: inverse_frequency
normalization:
  mode: paper_formula
  z_coordinate: discarded
source_notes:
  batch_size_text: 32
  batch_size_table: 34
  learning_rate_text: 0.0001
  learning_rate_table: 0.00010548643264689491
```

---

## 14. Hiperparâmetros de treino

### 14.1 Valores reportados

| Parâmetro | Valor no texto | Valor na Tabela 5.7 | Decisão baseline |
|---|---:|---:|---:|
| Épocas máximas | 40 | 40 | 40 |
| Batch size | 32 | 34 | 34 |
| Learning rate | `1e-4` | `0.00010548643264689491` | `0.00010548643264689491` |
| Otimizador | Adam | Adam | Adam |
| Early stopping | Sim | Não detalha paciência | Sim |
| Decay rate | Não detalhado | `LearningRate / Nepoch` | opcional, registrar |
| Otimização | Bayesiana | Sim | registrar como origem |

### 14.2 Configuração recomendada

```python
TRAINING_CONFIG = {
    "epochs": 40,
    "batch_size": 34,
    "learning_rate": 0.00010548643264689491,
    "optimizer": "adam",
    "early_stopping": True,
    "early_stopping_monitor": "val_loss",
    "early_stopping_patience": 5,
    "restore_best_weights": True,
    "class_weight": "inverse_frequency",
    "shuffle_train_windows": True,
    "seed": 42,
}
```

**Assunção crítica:** a paciência do early stopping não é reportada. Use `5` como padrão operacional, mas rode sensibilidade com `3`, `5` e `10`.

### 14.3 Pesos por classe

Como há forte desbalanceamento, usar ponderação inversa:

```python
from sklearn.utils.class_weight import compute_class_weight
import numpy as np

classes = np.array([0, 1])
y_int = np.argmax(y_train, axis=1)
weights = compute_class_weight(
    class_weight="balanced",
    classes=classes,
    y=y_int,
)
class_weight = {0: weights[0], 1: weights[1]}
```

---

## 15. Estratégia de validação

### 15.1 Leave-one-video-out

A validação deve seguir 9 folds. Em cada iteração, um vídeo é teste e os outros 8 são treino.

| Fold | Treino | Teste |
|---|---|---|
| 1 | `#2`-`#9` | `#1` |
| 2 | `#1`, `#3`-`#9` | `#2` |
| 3 | `#1`, `#2`, `#4`-`#9` | `#3` |
| 4 | `#1`-`#3`, `#5`-`#9` | `#4` |
| 5 | `#1`-`#4`, `#6`-`#9` | `#5` |
| 6 | `#1`-`#5`, `#7`-`#9` | `#6` |
| 7 | `#1`-`#6`, `#8`-`#9` | `#7` |
| 8 | `#1`-`#7`, `#9` | `#8` |
| 9 | `#1`-`#8` | `#9` |

### 15.2 Proibição de vazamento temporal

Não misture janelas do mesmo vídeo entre treino e teste. O split deve ser por vídeo, não por janela.

### 15.3 Validação interna durante o treino

A dissertação não detalha como foi criado o conjunto de validação usado pelo early stopping. Para implementação:

- dentro dos 8 vídeos de treino, separe 1 vídeo para validação interna; ou
- use `validation_split=0.1` por janela, mas registre que isso pode introduzir dependência temporal.

**Recomendação científica:** usar validação interna por vídeo para reduzir vazamento.

---

## 16. Inferência frame a frame

Para cada microação `a`:

1. selecionar features da região `Ra`;
2. gerar janelas de 7 frames;
3. predizer probabilidade `p_a` para a classe positiva;
4. associar a predição ao último frame da janela;
5. aplicar threshold.

```python
def predict_action(model, X, threshold=0.5):
    proba = model.predict(X)[:, 1]
    pred = (proba >= threshold).astype(int)
    return proba, pred
```

### 16.1 Threshold

A dissertação usa saída softmax binária, mas não explicita ajuste de threshold. Baseline:

```text
threshold = 0.5
```

Rodar análise de sensibilidade:

```text
threshold ∈ {0.3, 0.4, 0.5, 0.6, 0.7}
```

O threshold escolhido deve maximizar o erro relativo dos descritores, não apenas F1 frame a frame.

---

## 17. Sumarização dos resultados

### 17.1 Colapso de previsões consecutivas

A dissertação não conta duração bruta da ação. Ela conta eventos. Para isso, previsões positivas consecutivas são colapsadas.

Exemplo:

```text
00000111111100111 -> 0101
```

Contagem:

```text
sum(0101) = 2 eventos
```

### 17.2 Implementação

```python
import numpy as np


def collapse_consecutive_positives(pred: np.ndarray) -> np.ndarray:
    """
    Converte sequência binária frame a frame em eventos.
    Mantém apenas a primeira posição positiva de cada bloco consecutivo.
    """
    pred = np.asarray(pred).astype(int)
    if pred.size == 0:
        return pred

    collapsed = np.zeros_like(pred)
    collapsed[0] = pred[0]

    for i in range(1, len(pred)):
        if pred[i] == 1 and pred[i - 1] == 0:
            collapsed[i] = 1

    return collapsed


def count_events(pred: np.ndarray) -> int:
    return int(collapse_consecutive_positives(pred).sum())
```

### 17.3 Descritor final do vídeo

```python
def build_video_descriptor(predictions_by_action):
    return {
        action: count_events(pred)
        for action, pred in predictions_by_action.items()
    }
```

Saída:

```json
{
  "video_id": "#1",
  "OF": 71,
  "OC": 113,
  "ML": 2,
  "VR": 0
}
```

---

## 18. Métricas de avaliação

### 18.1 Métricas frame a frame

Calcular por fold e por microação:

- `TN`
- `FP`
- `FN`
- `TP`
- precisão;
- revocação/sensibilidade;
- especificidade;
- F1-score;
- acurácia;
- AUC;
- MAE;
- MSE.

### 18.2 Métrica principal para replicação da dissertação

A métrica mais importante é o erro relativo dos descritores agregados:

```text
erro_relativo = abs(anotado - previsto) / max(anotado, 1)
```

### 18.3 Resultado esperado da dissertação

| Microação | # Anotado | # Previsto | Erro relativo |
|---|---:|---:|---:|
| `OF` | 791 | 725 | 8.34% |
| `OC` | 1719 | 1482 | 13.79% |
| `ML` | 23 | 23 | 0.00% |
| `VR` | 1 | 1 | 0.00% |

Critério de aceitação para replicação aproximada:

| Microação | Critério sugerido |
|---|---|
| `OF` | erro relativo entre 5% e 15% |
| `OC` | erro relativo entre 8% e 20% |
| `ML` | diferença absoluta <= 5 eventos |
| `VR` | apenas validação qualitativa; base insuficiente |

---

## 19. Resultados por vídeo esperados

Tabela de predições agregadas reportada:

| Vídeo | OF | OC | ML | VR |
|---|---:|---:|---:|---:|
| `#1` | 71 | 113 | 2 | 0 |
| `#2` | 47 | 73 | 7 | 0 |
| `#3` | 47 | 247 | 6 | 1 |
| `#4` | 149 | 265 | 2 | 0 |
| `#5` | 58 | 124 | 0 | 0 |
| `#6` | 119 | 155 | 1 | 0 |
| `#7` | 75 | 160 | 4 | 0 |
| `#8` | 94 | 203 | 1 | 0 |
| `#9` | 65 | 142 | 0 | 0 |
| **Total** | **725** | **1482** | **23** | **1** |

---

## 20. Cortes de frames usados na análise de erros

A dissertação aponta concentração de erros no início e fim dos vídeos e reporta cortes:

| ID | Frames | Frame inicial | Frame final | Frames totais pós-corte |
|---|---:|---:|---:|---:|
| 1 | 5979 | 60 | 5623 | 5563 |
| 2 | 6269 | 88 | 5372 | 5284 |
| 3 | 6038 | 0 | 5633 | 5633 |
| 4 | 5720 | 0 | 5918 | 5918 |
| 5 | 6083 | 0 | 5683 | 5683 |
| 6 | 6083 | 0 | 5942 | 5942 |
| 7 | 5811 | 0 | 6022 | 6022 |
| 8 | 6184 | 0 | 5942 | 5942 |
| 9 | 6266 | 0 | 5943 | 5943 |

**Alerta:** há inconsistências aparentes em alguns cortes, pois certos `frame final` são maiores que o total de frames reportado. Exemplo: ID 4 tem `5720` frames, mas `frame final = 5918`. Tratar essa tabela como evidência de que cortes foram aplicados, não como contrato operacional definitivo.

Para implementação, definir cortes no arquivo:

```text
data/metadata/video_cuts.csv
```

Contrato:

```text
video_id,total_frames,start_frame,end_frame,notes
#1,5979,60,5623,"paper table"
```

---

## 21. Scripts CLI obrigatórios

### 21.1 Extrair landmarks

```bash
python -m cast.vision.extract_landmarks \
  --videos-dir data/raw/videos \
  --output data/interim/landmarks_raw.parquet \
  --refine-landmarks true
```

### 21.2 Normalizar landmarks

```bash
python -m cast.vision.normalize_landmarks \
  --input data/interim/landmarks_raw.parquet \
  --output data/interim/landmarks_normalized.parquet \
  --mode paper_formula
```

### 21.3 Gerar janelas

```bash
python -m cast.features.generate_windows \
  --landmarks data/interim/landmarks_normalized.parquet \
  --annotations data/annotations/frame_labels.csv \
  --feature-mode roi_features \
  --output-dir data/processed/windows
```

### 21.4 Treinar leave-one-video-out

```bash
python -m cast.experiments.leave_one_video_out \
  --action OF \
  --feature-mode roi_features \
  --epochs 40 \
  --batch-size 34 \
  --learning-rate 0.00010548643264689491 \
  --output-dir models/checkpoints
```

### 21.5 Gerar relatório de replicação

```bash
python -m cast.experiments.reproduce_paper \
  --models-dir models/checkpoints \
  --windows-dir data/processed/windows \
  --output reports/metrics/reproduction_report.md
```

---

## 22. Especificação dos arquivos

### 22.1 `videos.csv`

```text
video_id,original_student_id,group,learning_gain,variation,filepath,duration_sec,resolution,status
#1,4,R,8.5,0.6071,data/raw/videos/video_001.mp4,180,1920x1080,valid
```

### 22.2 `frame_labels.csv`

```text
video_id,frame_idx,NEUTRO,OF,OC,ML,VR
#1,0,1,0,0,0,0
#1,1,0,1,0,0,0
```

### 22.3 `landmarks_raw.parquet`

| Campo | Tipo |
|---|---|
| `video_id` | string |
| `frame_idx` | int |
| `timestamp_ms` | float |
| `face_detected` | bool |
| `landmark_idx` | int |
| `x` | float |
| `y` | float |
| `z` | float |

### 22.4 `landmarks_normalized.parquet`

| Campo | Tipo |
|---|---|
| `video_id` | string |
| `frame_idx` | int |
| `region` | string |
| `landmark_idx` | int |
| `x_norm` | float |
| `y_norm` | float |
| `normalization_mode` | string |

### 22.5 `windows.npz`

```python
np.savez_compressed(
    output_path,
    X=X,                         # float32: (n_samples, 7, n_features)
    y=y,                         # int/float: (n_samples, 2)
    video_id=video_ids,           # str array
    target_frame_idx=frame_idxs,  # int array
    action=action,                # str
    feature_mode=feature_mode,    # str
)
```

### 22.6 `descriptor_errors.csv`

```text
action,annotated,predicted,absolute_error,relative_error
OF,791,725,66,0.0834
OC,1719,1482,237,0.1379
ML,23,23,0,0.0000
VR,1,1,0,0.0000
```

---

## 23. Testes automatizados obrigatórios

### 23.1 Teste dos pontos regionais

```python
def test_default_100_points_has_expected_size():
    points = get_points(DEFAULT_100_POINT_REGIONS)
    assert len(points) == 100
    assert len(set(points)) == 100
```

### 23.2 Teste de normalização

```python
def test_region_normalization_maps_to_0_1():
    points = np.array([[10, 10], [20, 30], [15, 20]], dtype=float)
    normalized = normalize_region(points, mode="paper_formula")
    assert normalized.min() >= 0.0
    assert normalized.max() <= 1.0
```

### 23.3 Teste de janelas

```python
def test_sliding_window_generates_n_minus_6_samples():
    X = np.random.rand(10, 200)
    y = np.zeros((10,))
    Xw, yw = make_windows(X, y, sequence_length=7)
    assert Xw.shape[0] == 4
```

### 23.4 Teste do target no último frame

```python
def test_window_target_is_last_frame_label():
    y = np.array([0, 0, 0, 0, 0, 0, 1])
    _, yw = make_windows(np.random.rand(7, 200), y, sequence_length=7)
    assert yw[0] == 1
```

### 23.5 Teste do colapso de eventos

```python
def test_collapse_consecutive_positives():
    pred = np.array([0,0,0,0,0,1,1,1,1,1,1,0,0,1,1,1])
    collapsed = collapse_consecutive_positives(pred)
    assert collapsed.tolist() == [0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0]
    assert collapsed.sum() == 2
```

### 23.6 Teste de shape do modelo

```python
def test_model_output_shape():
    model = build_micro_action_lstm(n_features=200)
    assert model.input_shape == (None, 7, 200)
    assert model.output_shape == (None, 2)
```

---

## 24. Critérios de aceite da replicação

### 24.1 Aceite mínimo

- pipeline processa os 9 vídeos válidos;
- landmarks são extraídos com FaceMesh e íris;
- janelas de 7 frames são geradas sem vazamento entre vídeos;
- 4 classificadores binários são treinados;
- descritores por vídeo são gerados;
- relatório final reproduz tabela anotado vs. previsto.

### 24.2 Aceite científico aproximado

| Item | Critério |
|---|---|
| `OF` | erro relativo até 15% |
| `OC` | erro relativo até 20% |
| `ML` | diferença absoluta até 5 eventos |
| `VR` | apenas checagem qualitativa |
| Logs | todos os folds com manifesto reproduzível |
| Seeds | registradas |
| Ambiente | `requirements.lock` versionado |

### 24.3 Aceite para produto

- upload de vídeo assíncrono;
- processamento com job status;
- relatório por vídeo;
- timeline por microação;
- exportação CSV/JSON;
- exclusão de vídeo bruto por política de retenção;
- consentimento explícito;
- auditoria de modelo e versão.

---

## 25. Integração com backend profissional

### 25.1 Serviços internos

```text
VideoIngestionService
LandmarkExtractionService
LandmarkNormalizationService
WindowGenerationService
MicroActionTrainingService
MicroActionInferenceService
DescriptorAggregationService
EvaluationService
ReportService
```

### 25.2 Endpoints FastAPI recomendados

```text
POST   /videos/upload
GET    /videos/{video_id}
POST   /videos/{video_id}/process
GET    /jobs/{job_id}
GET    /videos/{video_id}/landmarks
GET    /videos/{video_id}/micro-actions
GET    /videos/{video_id}/descriptor
POST   /experiments/reproduce-paper
GET    /experiments/{experiment_id}/metrics
```

### 25.3 Tabelas PostgreSQL principais

```text
videos
participants
video_metadata
frame_annotations
landmark_extraction_jobs
model_versions
model_manifests
inference_jobs
micro_action_predictions
video_descriptors
experiment_runs
experiment_metrics
```

---

## 26. Integração com frontend React

O frontend deve expor a replicação sem esconder a incerteza científica.

Telas mínimas:

1. **Projetos/Estudos**: conjunto de vídeos e metadados.
2. **Upload de vídeo**: validação de formato, duração, resolução.
3. **Status do processamento**: extração, normalização, inferência.
4. **Anotação manual**: frame viewer com labels `NEUTRO`, `OF`, `OC`, `ML`, `VR`.
5. **Timeline de microações**: eventos detectados ao longo do vídeo.
6. **Descritor do vídeo**: contagem colapsada por microação.
7. **Relatório experimental**: métricas por fold, matriz de confusão e erro relativo.
8. **Governança**: consentimento, retenção, exclusão de vídeos.

---

## 27. Riscos técnicos e científicos

| Risco | Impacto | Mitigação |
|---|---|---|
| Base pequena | baixa generalização | coletar mais dados, validação externa |
| Pouca ocorrência de `VR` e `ML` | métrica instável | tratar como classes exploratórias |
| Iluminação variável | falsos positivos/negativos | controle de qualidade e normalização |
| Máscaras/acessórios | falha de landmarks | filtro automático de qualidade |
| Baixa resolução | perda de landmarks finos | mínimo de resolução e taxa de detecção |
| Dependência de FaceMesh | mudança entre versões | congelar versão e salvar landmarks brutos |
| Overfitting por poucos vídeos | resultado otimista | leave-one-subject/video-out e novos dados |
| Inferência sobre carga cognitiva | risco de alegação exagerada | posicionar como microações correlacionais |

---

## 28. Riscos éticos, privacidade e LGPD

Vídeos faciais são dados biométricos e potencialmente sensíveis. O sistema deve ser desenhado com proteção desde o início.

Requisitos mínimos:

- consentimento explícito por participante;
- finalidade clara: pesquisa/análise educacional;
- opção de revogação;
- retenção limitada dos vídeos brutos;
- pseudonimização de participantes;
- criptografia em repouso e em trânsito;
- trilha de auditoria de acesso;
- política de exclusão definitiva;
- evitar decisões automatizadas de alto impacto sobre estudantes;
- não apresentar o resultado como diagnóstico emocional, psicológico ou cognitivo individual.

Mensagem recomendada no produto:

```text
Este sistema estima padrões de microações faciais em vídeos. Os resultados são indicadores exploratórios e não constituem diagnóstico de carga cognitiva, emoção, atenção ou desempenho individual.
```

---

## 29. Roadmap de implementação

### Sprint 1 — Reprodutibilidade mínima

- criar estrutura do projeto;
- implementar regiões FaceMesh;
- implementar normalização;
- implementar janelas de 7 frames;
- implementar colapso de eventos;
- criar testes unitários.

### Sprint 2 — Treino e validação

- implementar modelo LSTM;
- implementar leave-one-video-out;
- implementar class weights;
- gerar métricas por fold;
- comparar com Tabelas 5.9, 5.10 e 5.11.

### Sprint 3 — Pipeline backend

- API FastAPI;
- workers assíncronos;
- PostgreSQL para metadados;
- object storage para vídeos e artefatos;
- endpoint de relatório.

### Sprint 4 — Anotação e frontend

- tela de anotação manual;
- timeline de vídeo;
- visualização de landmarks;
- dashboard de descritores.

### Sprint 5 — Produto e governança

- autenticação;
- consentimento;
- auditoria;
- versionamento de modelo;
- exportação para pesquisa;
- documentação LGPD.

---

## 30. Checklist final para o desenvolvedor

Antes de chamar a replicação de “concluída”, verificar:

- [ ] `requirements.lock` versionado.
- [ ] Todos os vídeos possuem `video_id` estável.
- [ ] Todos os frames têm índice consistente começando em `0` ou `1`; documentar escolha.
- [ ] `refine_landmarks=True` ativado.
- [ ] Índices de íris retornam valores válidos.
- [ ] Coordenada `z` descartada no baseline.
- [ ] Normalização por região implementada.
- [ ] Modo `paper_formula` usado no baseline.
- [ ] Janelas geradas com `n_i - 6` amostras.
- [ ] Target da janela é o último frame.
- [ ] Split é leave-one-video-out.
- [ ] Nenhuma janela do vídeo de teste aparece no treino.
- [ ] Class weights aplicados.
- [ ] Hiperparâmetros da Tabela 5.7 usados no baseline.
- [ ] Divergência batch size 32 vs. 34 documentada.
- [ ] Modelo salva manifesto YAML.
- [ ] Predições consecutivas positivas são colapsadas.
- [ ] Descritores finais são comparados com groundtruth.
- [ ] Relatório contém erro relativo por microação.
- [ ] Limitações e riscos éticos aparecem no relatório.

---

## 31. Lacunas que ainda precisam ser resolvidas

Para uma replicação mais fiel, recuperar ou reconstruir:

1. dados brutos dos 9 vídeos válidos;
2. anotações manuais originais por frame;
3. versão exata do Python;
4. versão exata do TensorFlow/Keras;
5. versão exata do MediaPipe;
6. código original de extração e normalização;
7. seeds utilizadas;
8. paciência e critério do early stopping;
9. função de decay usada no otimizador;
10. resultado da otimização bayesiana completa;
11. pesos finais dos modelos;
12. critério exato dos cortes iniciais/finais por vídeo.

---

## 32. Comando de reprodução esperado

Ao final, deve existir um comando único:

```bash
make reproduce-paper
```

Comportamento esperado:

```text
1. valida ambiente
2. valida dados brutos
3. extrai landmarks
4. normaliza landmarks
5. gera janelas
6. treina 4 classificadores em 9 folds
7. gera predições
8. colapsa eventos consecutivos
9. calcula descritores
10. gera relatório final
```

Saídas esperadas:

```text
reports/metrics/reproduction_report.md
reports/metrics/fold_metrics.csv
reports/metrics/descriptor_errors.csv
models/manifests/*.yaml
models/checkpoints/*.keras
```

---

## 33. Makefile sugerido

```makefile
.PHONY: install test extract normalize windows train reproduce-paper

install:
	pip install -r requirements.txt

test:
	pytest -q

extract:
	python -m cast.vision.extract_landmarks \
		--videos-dir data/raw/videos \
		--output data/interim/landmarks_raw.parquet \
		--refine-landmarks true

normalize:
	python -m cast.vision.normalize_landmarks \
		--input data/interim/landmarks_raw.parquet \
		--output data/interim/landmarks_normalized.parquet \
		--mode paper_formula

windows:
	python -m cast.features.generate_windows \
		--landmarks data/interim/landmarks_normalized.parquet \
		--annotations data/annotations/frame_labels.csv \
		--feature-mode roi_features \
		--output-dir data/processed/windows

train:
	python -m cast.experiments.leave_one_video_out \
		--all-actions \
		--feature-mode roi_features \
		--epochs 40 \
		--batch-size 34 \
		--learning-rate 0.00010548643264689491

reproduce-paper: test extract normalize windows train
	python -m cast.experiments.reproduce_paper \
		--models-dir models/checkpoints \
		--windows-dir data/processed/windows \
		--output reports/metrics/reproduction_report.md
```

---

## 34. Decisão final recomendada

Para transformar o CAST em sistema profissional, não comece pelo frontend. Comece por uma suíte de replicação controlada. Sem isso, o React apenas deixará mais bonito um modelo cuja validade ainda não foi auditada.

Ordem correta:

1. reproduzir pipeline offline;
2. congelar dados, versões e métricas;
3. criar API backend para jobs;
4. criar frontend de visualização/anotação;
5. expandir base de dados;
6. só então discutir inferência de carga cognitiva.

