# 08 — Known Issues and Corrections V6

## Objetivo

Listar os problemas encontrados nos notebooks V6 e definir como corrigir antes da integração ao CAST Pro.

## 1. Uso de `globals()`

### Problema

Os notebooks criam variáveis dinâmicas:

```python
globals()[f"DF_VIDEO_{num_video}"]
globals()[f"acoes_video{num_video}"]
```

Isso dificulta teste, manutenção e API.

### Correção

Usar dicionários tipados:

```python
videos[video_id] = VideoDataset(
    landmarks=landmarks_df,
    annotations=annotations_df
)
```

## 2. Caminhos absolutos locais

### Problema

O notebook usa:

```python
C:\Users\crist\OneDrive\APPMESTRADO\app\CAST\models\dados
```

### Correção

Usar configuração:

```yaml
CAST_DATA_ROOT=/data/cast
```

Ou storage via S3/MinIO.

## 3. Duplicidade e sobrescrita de funções

### Problema

`criar_dataframes_mudancas_prev` aparece várias vezes com implementações diferentes.

### Correção

Criar módulo único:

```text
cast_ml/postprocessing/compaction.py
```

Com testes unitários.

## 4. Bug no mapeamento do vídeo 6

### Problema

No notebook:

```python
"VIDEO_6": X_5.values
"VIDEO_6": Y_5.values
"VIDEO_6": W_5
```

### Correção

Deve ser:

```python
"VIDEO_6": X_6.values
"VIDEO_6": Y_6.values
"VIDEO_6": W_6
```

## 5. `fit_transform` no teste

### Problema

No caminho PCA/Scaled:

```python
df_teste_X_scaled = scaler.fit_transform(df_teste_X)
df_teste_X_pca = pca.fit_transform(df_teste_X_scaled)
```

Isso invalida a comparabilidade.

### Correção

```python
df_teste_X_scaled = scaler.transform(df_teste_X)
df_teste_X_pca = pca.transform(df_teste_X_scaled)
```

## 6. `sigmoid` com `CategoricalCrossentropy`

### Problema

A última célula usa:

```python
Dense(2, activation="sigmoid")
loss=CategoricalCrossentropy()
```

Para classes mutuamente exclusivas, usar `softmax`.

### Correção

```python
Dense(2, activation="softmax")
loss=CategoricalCrossentropy()
```

Alternativa binária:

```python
Dense(1, activation="sigmoid")
loss=BinaryCrossentropy()
```

## 7. Janela temporal e rótulo

### Problema

A função usa 7 frames e rótulo no frame imediatamente posterior.

```python
X_window = X[window_start:window_end, :]
y_window = Y[window_end, :]
```

### Correção

Decidir e documentar:

| Política | Label |
|---|---|
| `next_frame_after_window` | `Y[window_start + 7]` |
| `last_frame_in_window` | `Y[window_start + 6]` |

## 8. Pesos de classe por fold

### Problema

Os pesos são calculados, mas o loop final pode usar a última variável `pesos` para todos os folds.

### Correção

Armazenar pesos por fold:

```python
fold_data.append({
  "X_train": X_train,
  "y_train": y_train,
  "class_weight": class_weight_for_this_fold
})
```

## 9. Salvamento de modelo genérico

### Problema

```python
model.save(f"modelo_{n}.tf")
```

### Correção

```python
model.save(f"{artifact_dir}/{action}/fold_{test_video_id}/model.keras")
```

## 10. Métricas sem estrutura

### Problema

`classification_report` é impresso, mas não salvo de forma estruturada.

### Correção

```python
classification_report(..., output_dict=True)
```

Salvar em JSON.

## 11. Ausência de seeds

### Problema

Não há controle completo de aleatoriedade.

### Correção

```python
import random, numpy as np, tensorflow as tf
random.seed(42)
np.random.seed(42)
tf.random.set_seed(42)
```

Registrar seed no manifesto.

## 12. Dependências não versionadas

### Problema

Os notebooks não registram versões de libs.

### Correção

Gerar:

```bash
pip freeze > requirements-lock.txt
```

E salvar no run.

## 13. `pd.read_csv(..., sep="[|;]")` sem engine

### Problema

Regex separator exige engine Python em pandas.

### Correção

```python
pd.read_csv(path, sep=r"[|;]", engine="python")
```

## 14. Métrica accuracy enganosa

### Problema

Microações são raras; accuracy alta pode esconder baixa detecção da classe positiva.

### Correção

Promover por:

- F1 da ação;
- recall da ação;
- event-level F1;
- erro relativo de contagem.

## 15. Modelo por ação incompleto

### Problema

O notebook principal executa majoritariamente `modelo_olho_fechado`, enquanto o notebook de plots foca `OLHANDO_PARA_CANTO`.

### Correção

Treinar explicitamente:

```bash
--action OF
--action OC
--action ML
--action VR
```

Com manifests separados.

## Prioridade de correção

| Prioridade | Correção |
|---|---|
| P0 | remover caminhos absolutos |
| P0 | corrigir VIDEO_6 |
| P0 | registrar feature order |
| P0 | corrigir scaler/PCA no teste |
| P0 | salvar manifesto do modelo |
| P0 | decidir política de janela |
| P1 | substituir `globals()` |
| P1 | salvar métricas estruturadas |
| P1 | padronizar softmax ou binary sigmoid |
| P1 | adicionar seeds |
| P2 | calibrar threshold |
| P2 | adicionar event-level evaluation |
