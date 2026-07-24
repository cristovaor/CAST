# Fase 7 — Especificação de Métricas de Produto

## 1. Métricas de ativação

| Métrica | Definição |
|---|---|
| study_created_total | estudos criados |
| first_video_uploaded_rate | usuários que enviam primeiro vídeo |
| first_video_processed_rate | vídeos processados com sucesso |
| time_to_first_report | tempo até primeiro relatório |

## 2. Métricas operacionais

- taxa de falha de upload;
- taxa de vídeo rejeitado;
- tempo médio de processamento;
- jobs falhos por etapa;
- tempo médio de anotação por minuto de vídeo.

## 3. Métricas científicas

- Kappa entre anotadores;
- F1 event-level por microação;
- erro relativo descriptor-level;
- quantidade de vídeos por dataset_version;
- taxa de reprocessamento.

## 4. Métricas de valor

- relatórios gerados por estudo;
- exports realizados;
- número de revisões humanas;
- quantidade de insights marcados pelo pesquisador;
- número de materiais comparados.

## 5. Métricas de risco

- downloads de vídeo por usuário;
- solicitações de exclusão;
- incidentes de acesso;
- exports com dados sensíveis;
- vídeos processados sem consentimento válido.

## 6. North Star inicial

```text
Número de sessões de aprendizagem processadas com qualidade aceita e relatório revisado.
```

## 7. Critério de maturidade

MVP técnico vira produto quando:

- 100+ vídeos processados;
- taxa de falha < 5%;
- Kappa >= 0.70;
- relatórios usados por pelo menos 3 pesquisadores/professores;
- zero vídeo processado sem consentimento.
