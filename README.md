# CAST — Cognitive Analysis System

O CAST é uma plataforma científica full-stack para aquisição, sincronização,
processamento e exploração de dados multimodais. A plataforma combina vídeo
facial, landmarks, movimentos observáveis da cabeça, EEG/LSL, gaze,
pupillometria e eventos experimentais, mantendo proveniência, qualidade e
governança por organização.

O sistema produz associações descritivas e resultados de modelos; não deve ser
usado como diagnóstico clínico nem como prova causal de estado cognitivo.

## Arquitetura

- **Frontend:** React 19, TypeScript, Vite e Tailwind CSS. Inclui aquisição,
  sincronização, anotação, Explorer multimodal, modelos, relatórios e
  governança.
- **API:** FastAPI, SQLAlchemy, Alembic e PostgreSQL. Os endpoints protegidos
  exigem autenticação e aplicam escopo de organização/posse.
- **Processamento:** Celery e Redis. O worker padrão processa vídeo, datasets,
  inferência e exportações; o `eeg-worker` isolado executa a pilha científica
  de EEG na fila `eeg`.
- **Storage:** MinIO/S3 para dados brutos imutáveis, modelos e artefatos
  derivados com checksum.
- **ML:** modelos legados V6, modelo unificado V7 e Multimodal V8
  (cabeça + EEG sincronizado). O Triton/GPU é opcional; o caminho CPU continua
  disponível.
- **Aquisição local:** o agente `agents/cast-lsl-agent` controla o LabRecorder
  em loopback e envia o XDF somente após o encerramento da gravação.

## Execução local com Docker

Pré-requisitos: Docker Engine/Desktop com Compose v2 e recursos suficientes
para os containers científicos. O `docker-compose.yml` já define valores
locais de desenvolvimento:

```bash
docker compose up -d --build
```

Serviços locais:

| Serviço | Endereço |
|---|---|
| Frontend | `http://localhost` |
| API | `http://localhost:8080` |
| OpenAPI | `http://localhost:8080/api/v1/openapi.json` |
| MinIO API | `http://localhost:9000` |
| MinIO Console | `http://localhost:9001` |
| PostgreSQL | `localhost:5432` |
| Redis | `localhost:6379` |

O Triton só é iniciado explicitamente em hosts com GPU NVIDIA:

```bash
docker compose --profile gpu up -d --build
```

As migrações Alembic são aplicadas pelo `prestart.sh` do backend. A análise EEG
V2 já está habilitada no Compose local. Para ativar outra funcionalidade
experimental em containers, passe a flag descrita em `.env.example` ao serviço
`backend` e ao worker correspondente; em execução direta, a API lê `.env`.

## Desenvolvimento e testes

Backend (com as dependências instaladas):

```bash
cd src
pytest
```

Frontend:

```bash
cd frontend
npm install
npm run test
npm run build
npm run lint
```

## Treinamento e inferência

O treinamento operacional é iniciado pelo painel de modelos e produz um
artefato `draft` no Model Registry. Para o Multimodal V8, o split é feito por
participante e exige, no mínimo, duas sessões EEG aprovadas no treino, uma na
validação e 20 janelas EEG válidas de validação. EEG ausente pode ser mascarado
na inferência, mas sincronização não aprovada nunca é tratada como offset zero.

As especificações atuais estão em:

- [`docs/03_model_validation/05_multimodal_v8_spec.md`](docs/03_model_validation/05_multimodal_v8_spec.md)
- [`docs/04_backend/eeg_analysis_v2.md`](docs/04_backend/eeg_analysis_v2.md)
- [`docs/09_multimodal_expansion/00_INDEX.md`](docs/09_multimodal_expansion/00_INDEX.md)

As especificações V6 permanecem preservadas em `docs/cast_v6_model_specs/`
como referência histórica e de compatibilidade.

## Documentação

O índice canônico está em [`docs/README.md`](docs/README.md). Para deploy no
EasyPanel, consulte
[`docs/deployment/DEPLOY_EASYPANEL.md`](docs/deployment/DEPLOY_EASYPANEL.md).

## Licença

Consulte [`LICENSE`](LICENSE). Componentes científicos incorporados mantêm
licenças e proveniência próprias, documentadas em
[`docs/04_backend/eeg_analysis_v2.md`](docs/04_backend/eeg_analysis_v2.md).
