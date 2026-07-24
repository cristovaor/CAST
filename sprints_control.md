# Controle de Sprints — Plataforma CAST

Este arquivo acompanha o progresso de desenvolvimento do backend da plataforma CAST.

## Respostas de Definição (Kickoff)
1. **Objetivo**: Pesquisa Acadêmica.
2. **Armazenamento**: O vídeo bruto será armazenado pelo tempo de pesquisa.
3. **Privacidade**: Consentimento explícito dos participantes.
4. **Arquitetura**: Não será multi-tenant.
5. **Modelos**: PyTorch.
6. **Escopo MVP**: A anotação manual fará parte do MVP.
7. **Visão Comercial**: Ferramenta de pesquisadores.

---

## 🏃 Sprint 0 — Fundação (Em Andamento)
- [ ] Criar repositório backend (Estrutura `src/` e `frontend/`)
- [ ] Configurar Docker Compose (PostgreSQL, Redis, MinIO)
- [ ] Configurar FastAPI (`main.py`, roteamento base)
- [ ] Configurar PostgreSQL (SQLAlchemy) e Redis
- [ ] Criar Alembic migrations
- [ ] Criar autenticação básica (estrutura JWT)
- [ ] Configuração de ambiente (`config.py`)

## 📅 Sprint 1 — Domínio e Upload (Pendente)
- [ ] Implementar projetos, estudos, participantes e sessões.
- [ ] Implementar consentimento.
- [ ] Implementar upload pré-assinado (MinIO/S3).
- [ ] Implementar validação básica de vídeo.
- [ ] Implementar jobs e status.

## 📅 Sprint 2 — Pipeline de Vídeo (Pendente)
- [ ] Implementar extração de metadados.
- [ ] Implementar worker de frames.
- [ ] Implementar FaceMesh (MediaPipe).
- [ ] Salvar landmarks em Parquet/JSON.
- [ ] Calcular quality_score.

## 📅 Sprint 3 — Inferência (Pendente)
- [ ] Implementar model registry simples (PyTorch).
- [ ] Carregar modelo versionado.
- [ ] Gerar janelas de 7 frames.
- [ ] Rodar inferência por microação.
- [ ] Salvar séries temporais e resumo.

## 📅 Sprint 4 — Relatórios (Pendente)
- [ ] Implementar learning gain.
- [ ] Implementar agregações por estudo/aula/grupo.
- [ ] Implementar exportação CSV/JSON/Parquet.
- [ ] Criar endpoints de dashboard.

## 📅 Sprint 5 — Anotação e Auditoria (Pendente)
- [ ] Endpoints para frames amostrados.
- [ ] CRUD de anotações (Parte do MVP).
- [ ] Exportação de dataset anotado.
- [ ] Auditoria de acesso.
