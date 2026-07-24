# Fase 6 — Runbook de Deploy

## 1. Ambientes

| Ambiente | Objetivo | Dados reais? |
|---|---|---|
| local | desenvolvimento | não |
| dev | integração | não |
| staging | homologação | dados sintéticos/anonimizados |
| prod | operação | sim, com controle |

## 2. Componentes

```text
frontend: React
api: FastAPI
worker: Python video/ML worker
postgres: metadados
redis: fila/cache
object storage: S3/MinIO
reverse proxy: nginx/ALB
auth: JWT/OIDC futuro
```

## 3. Deploy local

```bash
cp .env.example .env
docker compose up -d postgres redis minio
cd backend && uvicorn app.main:app --reload
cd frontend && npm run dev
```

## 4. Deploy staging/prod

Recomendado:

- Docker images versionadas;
- migrations antes da API;
- workers separados da API;
- buckets separados por ambiente;
- secrets via AWS Secrets Manager ou equivalente;
- logs centralizados.

## 5. Variáveis de ambiente

```text
DATABASE_URL=
REDIS_URL=
S3_ENDPOINT=
S3_BUCKET_RAW=
S3_BUCKET_ARTIFACTS=
JWT_SECRET=
MODEL_REGISTRY_PATH=
RETENTION_DEFAULT_DAYS=365
```

## 6. Backup

| Recurso | Estratégia |
|---|---|
| PostgreSQL | snapshot diário + PITR |
| S3 raw | versionamento + lifecycle |
| modelos | imutável por versão |
| logs | retenção separada |

## 7. Rollback

- API: voltar imagem Docker anterior.
- Banco: migrations reversíveis quando possível.
- Modelo: trocar `production_model_version`.
- Frontend: deploy de build anterior.

## 8. Health checks

- `/health/live`
- `/health/ready`
- `/health/dependencies`

## 9. Checklist deploy

- [ ] migrations aplicadas;
- [ ] API health OK;
- [ ] worker conectado ao Redis;
- [ ] S3 acessível;
- [ ] modelo ativo carregável;
- [ ] job de teste executado;
- [ ] logs e métricas aparecendo;
- [ ] backup verificado.
