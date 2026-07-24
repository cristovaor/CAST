# CAST (Cognitive Analysis System) - v6

CAST é uma plataforma full-stack para análise de vídeos com extração de landmarks (MediaPipe FaceMesh) e inferência de microações faciais utilizando arquiteturas neurais temporais (Keras LSTM).

## Visão Geral da Arquitetura

1. **Frontend**: React, TypeScript, TailwindCSS. Consome endpoints REST para gestão de vídeos, visualização de inferências e painéis de qualidade.
2. **Backend**: FastAPI, PostgreSQL, SQLAlchemy. Responsável por orquestrar processamentos (via Celery), gerenciar o *Model Registry* e persistir metadados.
3. **Machine Learning Core (`cast/`)**: 
   - Feature engineering baseado em landmarks e janelas deslizantes (7-frames).
   - Treinamento utilizando LOVO (Leave-One-Video-Out).
   - Inferência multi-modelo orquestrada pelo Celery.
4. **Storage**: MinIO (S3-compatible) para guardar vídeos brutos e JSONs de predições.

## Execução

Utilize o Docker Compose para subir toda a stack:
```bash
docker-compose up -d --build
```
O backend estará acessível em `localhost:8000`, e o frontend em `localhost:80`.

## Treinamento de Modelos (CLI)

O diretório de ML está configurado de forma independente dentro de `src/cast/`. Para treinar um modelo de micro-ação:
```bash
python -m cast.models.train_cli data/ --action OF --epochs 40
```
O artefato final (`.keras`) e o `manifest.json` serão gerados no diretório configurado em `cast/config/settings.py`.

## Fluxo de Inferência (Model Registry)

1. Os modelos gerados pelo CLI devem ser registrados no painel **Modelos** (`/app/models`).
2. Uma vez registrados, devem ser promovidos para o status **Active**.
3. Na página do vídeo, o botão **Rodar Inferência** enviará uma requisição ao endpoint `/videos/{id}/infer`.
4. Um worker Celery fará: extração de landmarks → normalização → inferência no LSTM → filtro temporal de eventos → armazenamento no MinIO.
