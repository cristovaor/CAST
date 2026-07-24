# Fase 0 — Escopo do MVP e Não Objetivos

## 1. Produto inicial

O MVP deve responder a uma pergunta objetiva:

> Dado um vídeo facial padronizado de um estudante assistindo uma aula multimídia, o sistema consegue extrair landmarks, detectar microações, gerar contagens/eventos e permitir revisão humana?

## 2. Funcionalidades P0

- Login e controle de papéis.
- CRUD de estudos.
- Cadastro de participante pseudonimizado.
- Upload de vídeo via URL pré-assinada.
- Validação de qualidade do vídeo.
- Job assíncrono para landmarks.
- Job assíncrono para inferência.
- Timeline de eventos.
- Anotação manual frame/intervalo.
- Exportação CSV/Parquet.
- Relatório básico.
- Auditoria de acesso.

## 3. Funcionalidades P1

- Comparação humano vs modelo.
- Dupla anotação e resolução de conflito.
- Dashboard por aula.
- Reprocessamento com outro modelo.
- Model registry.
- Dataset registry.
- WebSocket/SSE para progresso em tempo real.

## 4. Funcionalidades P2

- Integração LMS.
- Coleta via navegador/WebRTC.
- Inferência quase em tempo real.
- Recomendações pedagógicas.
- A/B test de materiais educacionais.
- Multi-tenant institucional.

## 5. Não objetivos

- Identificar pessoas.
- Medir emoção de forma definitiva.
- Diagnosticar TDAH, ansiedade, estresse ou condição clínica.
- Substituir avaliação pedagógica humana.
- Tomar decisão automatizada sobre aprovação, nota ou desempenho do estudante.
- Prometer medição direta de carga cognitiva.

## 6. Frase de posicionamento segura

> O CAST Pro analisa microações faciais em vídeos de aprendizagem multimídia e gera indicadores exploratórios para pesquisa educacional e melhoria de materiais didáticos.

## 7. Critério de pronto para sair do MVP

- 30+ vídeos coletados sob protocolo padronizado.
- Dois anotadores por vídeo.
- Kappa >= 0.70 em pelo menos 3 microações.
- Pipeline reexecutável por CLI e API.
- Relatórios com versão de modelo e dataset.
- Consentimento e exclusão funcional.
