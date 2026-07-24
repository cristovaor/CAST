# Roadmap Futuro (CAST V2 e V3)

Este documento armazena as evoluções planejadas para o projeto CAST que sucederão a Fase 5 (UX Clínico e Sincronização Multimodal). Elas estão organizadas por trilhas de prioridade.

## Fase 6: Automação e Treinamento Contínuo de ML (Active Learning)
- **Fechando o Loop de Anotação**: Criar um pipeline onde a correção de uma predição da IA pelo anotador manual na UI marque aquele trecho de vídeo e o exporte automaticamente para um "Dataset de Retreino".
- **Integração com Servidor de Inferência**: Migrar a execução local (PyTorch/ONNX no Celery) para um servidor dedicado (ex: Triton Inference Server da NVIDIA) permitindo lidar com múltiplos fluxos RTMP ou batch processing via GPU de alta performance.

## Fase 7: DevOps e Empacotamento (Production Readiness)
- **Docker Compose Completo**: Configurar o ambiente com um `docker-compose.yml` abrangente (PostgreSQL, Redis/RabbitMQ, MinIO, FastAPI, Celery Worker, React/Vite). O sistema inteiro deve subir com `docker-compose up -d`.
- **CI/CD**: Estabelecer fluxos de GitHub Actions para linter (flake8, eslint), testes automatizados (pytest, vitest) e build de imagens Docker (Push para Docker Hub ou AWS ECR).
- **Gerenciamento de Segredos**: Implementar cofres (HashiCorp Vault ou AWS Secrets) em vez de simples `.env`.

## Fase 8: Relatórios Clínicos Dinâmicos (PDF Avançado)
- **Engine de PDF Avançada**: Substituir o gerador de relatórios genérico e injetar frameworks como `ReportLab`, `WeasyPrint` ou geração server-side (Puppeteer via Node/Python).
- **Conteúdo do Relatório**: 
  - Capa timbrada e dados do paciente/participante.
  - Snapshot visual de métricas (Gráficos renderizados via Matplotlib no backend ou imagens geradas no Front).
  - Tabela consolidada de evolução de aprendizado (Testes Pré vs Pós).
  - Assinatura digital.
