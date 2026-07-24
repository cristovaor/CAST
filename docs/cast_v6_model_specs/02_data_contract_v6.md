# 02 — Data Contract V6

## Objetivo

Definir o contrato de dados necessário para treinar, avaliar e servir o modelo CAST LSTM V6 no novo sistema.

## Estrutura de diretórios observada nos notebooks

O notebook espera a seguinte estrutura local:

```text
dados/
  video_1/
    MICROACOES/
      *.csv
    PONTOSNORMALIZADOS/
      *.csv
  video_2/
    MICROACOES/
      *.csv
    PONTOSNORMALIZADOS/
      *.csv
  ...
  video_9/
    MICROACOES/
      *.csv
    PONTOSNORMALIZADOS/
      *.csv
```

No novo sistema, essa estrutura deve ser substituída por artefatos versionados:

```text
datasets/
  {dataset_id}/
    manifest.json
    videos/
      {video_id}/
        annotations.csv
        landmarks_normalized.csv
        quality_report.json
```

## Arquivo de landmarks normalizados

### Formato original

Os notebooks leem arquivos de `PONTOSNORMALIZADOS` com separador `;` ou `|`:

```python
pd.read_csv(path, sep="[|;]")
```

Para produção, exigir separador único `;` ou formato Parquet.

### Schema mínimo em CSV

```csv
FRAME;33_X;33_Y;7_X;7_Y;...;477_X;477_Y
0;0.123;0.552;0.111;0.541;...;0.221;0.781
1;0.124;0.553;0.112;0.542;...;0.222;0.782
```

### Schema recomendado em Parquet

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---:|---|
| `dataset_id` | string | sim | ID do dataset |
| `video_id` | string | sim | ID do vídeo |
| `frame` | int | sim | Índice do frame |
| `timestamp_ms` | int | recomendado | Tempo no vídeo |
| `landmark_id` | int | sim | ID MediaPipe |
| `x_norm` | float | sim | Coordenada X normalizada |
| `y_norm` | float | sim | Coordenada Y normalizada |
| `visibility` | float | opcional | Qualidade/visibilidade |
| `face_detected` | bool | sim | Se face foi detectada no frame |

## Arquivo de microações anotadas

### Colunas esperadas

O notebook espera que as colunas de ação estejam no final do dataframe:

```text
NEUTRO
OLHO_FECHADO
OLHANDO_PARA_CANTO
MEXEU_SOBRANCELHA
MEXEU_LABIOS
VIROU_ROSTO
```

### CSV recomendado

```csv
FRAME;NEUTRO;OLHO_FECHADO;OLHANDO_PARA_CANTO;MEXEU_SOBRANCELHA;MEXEU_LABIOS;VIROU_ROSTO
0;1;0;0;0;0;0
1;1;0;0;0;0;0
2;0;1;0;0;0;0
```

### Regras

1. Todas as colunas de ação devem ser binárias: `0` ou `1`.
2. `FRAME` deve ser inteiro, crescente e sem duplicidade.
3. Para treino binário por ação, o alvo será uma coluna específica.
4. `NEUTRO` deve ser usado como referência, mas não deve ser tratado como ação positiva.
5. Frames com múltiplas ações simultâneas devem ser aceitos somente se a política experimental permitir multirrótulo; caso contrário, devem ser rejeitados no validador.

## Mapeamento de pontos por microação

### `OF` — Olho fechado

```python
{
  "Olho Direito": [33, 7, 163, 144, 145, 153, 154, 155, 133, 246, 161, 160, 159, 158, 157, 173],
  "Olho Esquerdo": [263, 249, 390, 373, 374, 380, 381, 382, 362, 466, 388, 387, 386, 385, 384, 398]
}
```

Features:

```text
32 pontos * 2 coordenadas = 64 features
```

### `OC` — Olhando para canto

```python
{
  "Iris Direita": [469, 470, 471, 472],
  "Iris Esquerda": [474, 475, 476, 477]
}
```

Features:

```text
8 pontos * 2 coordenadas = 16 features
```

### `ML` — Mexeu lábios

```python
{
  "Labios": [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 185, 40, 39, 37, 0,
             267, 269, 270, 409, 78, 95, 88, 178, 87, 14, 317, 402, 318, 324,
             308, 191, 80, 81, 82, 13, 312, 311, 310, 415]
}
```

Features:

```text
40 pontos * 2 coordenadas = 80 features
```

### `VR` — Virou rosto

No notebook, `VR` usa `face_parts` completo:

```python
{
  "Olho Direito": 16 pontos,
  "Olho Esquerdo": 16 pontos,
  "Iris Direita": 4 pontos,
  "Iris Esquerda": 4 pontos,
  "Labios": 40 pontos
}
```

Features:

```text
80 pontos * 2 coordenadas = 160 features
```

## Ordem das features

A ordem das features é crítica. O notebook gera nomes assim:

```python
f"{landmark_id}_{coordinate}"
```

Com `coordinates = ["X", "Y"]`.

Exemplo:

```text
33_X, 33_Y, 7_X, 7_Y, 163_X, 163_Y, ...
```

A API deve rejeitar inferência se a ordem das features não bater com o manifesto do modelo.

## Manifesto obrigatório de features

Cada modelo registrado deve salvar:

```json
{
  "model_version": "cast-lstm-v6-of-raw-softmax",
  "action": "OF",
  "window_size": 7,
  "coordinates": ["X", "Y"],
  "feature_columns": ["33_X", "33_Y", "7_X", "7_Y"],
  "input_shape": [7, 64],
  "label_columns": ["NEUTRO", "OLHO_FECHADO"],
  "normalization": "landmarks_already_normalized_by_region",
  "preprocessing": {
    "scaler": null,
    "pca": null
  }
}
```

## Validações obrigatórias

Antes do treino:

- verificar presença de `FRAME`;
- verificar presença das colunas de ação;
- verificar presença de todas as features exigidas pelo modelo;
- rejeitar NaN;
- rejeitar infinito;
- validar monotonicidade de frame;
- validar que `len(video) > window_size`;
- validar distribuição de classe;
- gerar relatório de desbalanceamento.

Antes da inferência:

- verificar shape `(n_frames, n_features)`;
- verificar que `n_frames >= 7`;
- verificar ordem das features;
- verificar se as features pertencem à ação solicitada;
- verificar versão de pré-processamento compatível com o modelo.
