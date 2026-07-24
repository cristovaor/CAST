# 09 — Implementation Plan V6

## Objetivo

Transformar os notebooks V6 em módulos do backend Python/FastAPI do CAST Pro.

## Estrutura de código recomendada

```text
backend/
  app/
    api/
      routes/
        models.py
        inference.py
        training.py
        predictions.py
    ml/
      v6/
        config.py
        features.py
        dataset.py
        windowing.py
        model.py
        train.py
        infer.py
        postprocess.py
        evaluate.py
        registry.py
    schemas/
      model.py
      inference.py
      training.py
    workers/
      train_model_worker.py
      inference_worker.py
```

## Módulos

### `features.py`

Responsável por:

- mapear microação para landmarks;
- gerar lista de colunas;
- validar ordem das features.

Funções:

```python
get_feature_columns(action: str) -> list[str]
get_input_shape(action: str, mode: str) -> tuple[int, int]
validate_feature_schema(df, feature_columns)
```

### `dataset.py`

Responsável por:

- carregar landmarks;
- carregar anotações;
- unir `X` e `Y`;
- validar schema;
- criar dataset por vídeo.

Funções:

```python
load_video_dataset(video_id: str) -> VideoDataset
merge_landmarks_annotations(landmarks, annotations) -> DataFrame
validate_dataset(df) -> DatasetValidationReport
```

### `windowing.py`

Responsável por:

- criar janelas temporais;
- aplicar política de rótulo;
- retornar `X`, `y`, `frame_index`.

Função:

```python
create_windows(df, feature_columns, target_column, window_size=7, label_policy="next_frame_after_window")
```

### `model.py`

Responsável por:

- construir arquitetura LSTM;
- carregar modelo salvo;
- validar input shape.

Funções:

```python
build_lstm_v6(input_shape, learning_rate, output_activation="softmax")
load_lstm_v6_model(model_uri)
```

### `train.py`

Responsável por:

- rodar leave-one-video-out;
- calcular class weights;
- treinar;
- salvar métricas;
- registrar modelos.

CLI:

```bash
python -m app.ml.v6.train --dataset-id ... --action OF
```

### `infer.py`

Responsável por:

- carregar manifesto;
- aplicar preprocessamento;
- criar janelas;
- executar predição;
- persistir frame predictions.

### `postprocess.py`

Responsável por:

- threshold;
- compactar eventos;
- calcular descritores;
- exportar CSV/JSON.

### `evaluate.py`

Responsável por:

- frame-level metrics;
- event-level metrics;
- descriptor-level metrics;
- plots.

### `registry.py`

Responsável por:

- salvar modelo;
- salvar manifesto;
- carregar modelo ativo;
- promover versão;
- arquivar versão.

## Ordem de implementação

### Sprint 1 — Modularização

- Criar `features.py`.
- Criar `windowing.py`.
- Criar `model.py`.
- Criar testes unitários para feature order e windowing.

### Sprint 2 — Dataset e treino

- Criar `dataset.py`.
- Criar CLI de treino.
- Implementar leave-one-video-out.
- Salvar artifacts por fold.
- Corrigir pesos de classe por fold.

### Sprint 3 — Avaliação

- Implementar `evaluate.py`.
- Salvar classification report JSON.
- Salvar matriz de confusão.
- Implementar event-level evaluation.
- Gerar relatório `.json`.

### Sprint 4 — Registry

- Criar tabela `model_versions`.
- Criar manifesto.
- Criar endpoint de modelos.
- Criar promoção de modelo.

### Sprint 5 — Serving

- Criar inferência batch por vídeo.
- Criar worker assíncrono.
- Criar status de job.
- Persistir frame predictions e eventos.

### Sprint 6 — Frontend

- Exibir versão do modelo.
- Exibir eventos na timeline.
- Exibir qualidade e confiança.
- Permitir reprocessamento.

## Testes mínimos

### Teste de features

```python
def test_of_feature_columns_has_64_features():
    assert len(get_feature_columns("OF")) == 64
```

### Teste de windowing

```python
def test_create_windows_shape():
    X, y, frames = create_windows(df, features, "OLHO_FECHADO", window_size=7)
    assert X.shape[1] == 7
```

### Teste de manifesto

```python
def test_manifest_contains_feature_order():
    assert manifest["feature_columns"]
```

### Teste de inferência

```python
def test_predict_rejects_wrong_feature_count():
    with pytest.raises(FeatureSchemaMismatch):
        predict(wrong_shape_input)
```

## Jobs assíncronos

Treino e inferência devem rodar em worker, não no request HTTP.

Fila recomendada:

- Celery + Redis;
- RQ + Redis;
- Dramatiq;
- Argo Workflows se rodar em Kubernetes.

## Storage

Artefatos grandes:

- S3/MinIO.

Metadados:

- PostgreSQL.

Cache:

- Redis.

## Critérios de pronto

- O notebook não é mais necessário para treinar.
- O mesmo treino roda via CLI.
- O modelo gera manifesto.
- A API carrega modelo ativo.
- A inferência retorna eventos e frame predictions.
- O frontend consegue mostrar timeline.
