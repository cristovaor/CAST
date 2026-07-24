# Controle de Sprints - CAST Pro

Este documento serve como o registro central da evolução do projeto, rastreando o que foi concluído e o que está planejado.

## 🟢 Sprint 1: Domínio e Infraestrutura Base (Concluída)
- [x] Modelagem do banco (SQLAlchemy): User, Organization, Project, Study, Participant, Session, VideoAsset, ProcessingJob.
- [x] Configuração FastAPI (`main.py` e rotas).
- [x] Criação de Schemas Pydantic (`user`, `project`, `study`, `participant`, `video`).
- [x] Implementação do `StorageService` (MinIO presigned URLs).
- [x] Preparação da pasta de testes (`pytest`, `behave`).

## 🟢 Sprint 2: Pipeline de Vídeo (Concluída)
- [x] Instalação do OpenCV e MediaPipe.
- [x] Configuração do Worker assíncrono (Celery + Redis).
- [x] Implementação do extrator de landmarks faciais (`facemesh.py`).
- [x] Processamento de frames iterativos (`preprocessing.py`).
- [x] Roteamento de vídeo para a fila de processamento (endpoint `/process`).

## 🟢 Sprint 3: Inferência ML (Concluída)
- [x] Adição do PyTorch às dependências.
- [x] Model Registry simulado.
- [x] Lógica de janelamento temporal contínuo (*sliding windows* de 7 frames).
- [x] Sumarização de inferências boolianas e limpeza de "flickers".
- [x] Atualização da entidade `Prediction` no banco.
- [x] Tarefa assíncrona focada em inferência (`run_inference_task`).

## 🟢 Sprint 4: Relatórios e Exportação (Concluída)
- [x] Criação da entidade `LearningAssessment` (Acomodando Pré-teste e Pós-teste).
- [x] Endpoints para submissão de notas por sessão.
- [x] Criação do serviço agregador analítico usando Pandas DataFrame.
- [x] Lógica de cálculo do *Learning Gain* absoluto.
- [x] Geração e exportação bruta de relatórios (CSV/Parquet via MinIO).
- [x] Endpoint de consolidação de Dashboard de Estudos.

---

## 🟡 Sprint 5: Validação Infra e Frontend Mock (Em Planejamento)
**Objetivo Base**: Fazer a cola final conectando o sistema ao banco de dados rodando de fato, e entregar uma interface visual (Frontend) para experimentação tátil da jornada pelo pesquisador.
- [ ] Iniciar infraestrutura (PostgreSQL, Redis, MinIO) no Docker.
- [ ] Aplicar migrações do Alembic (`autogenerate` e `upgrade`).
- [ ] Criar estrutura do Frontend (`index.html`, `style.css` com design premium, `app.js`).
- [ ] Conectar os fluxos de "Criar Sessão", "Upload" e "Ver Dashboard" no Frontend.
- [ ] Executar bateria inicial de testes automatizados com o Pytest.
