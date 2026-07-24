# 10 — Acceptance Checklist V6

## Objetivo

Checklist final para aceitar a integração do modelo V6 no CAST Pro.

## Dados

- [ ] Dataset possui `manifest.json`.
- [ ] Cada vídeo possui landmarks normalizados.
- [ ] Cada vídeo possui anotações de microações.
- [ ] Coluna `FRAME` validada.
- [ ] Colunas de ação validadas.
- [ ] Features esperadas por ação validadas.
- [ ] NaN e infinitos rejeitados.
- [ ] Ordem das features persistida.
- [ ] Relatório de qualidade do vídeo associado.

## Treinamento

- [ ] Treino roda via CLI.
- [ ] Caminhos absolutos removidos.
- [ ] `globals()` removido.
- [ ] Bug do `VIDEO_6` corrigido.
- [ ] Leave-one-video-out implementado.
- [ ] Pesos de classe calculados por fold.
- [ ] Janela temporal documentada.
- [ ] Política de rótulo documentada.
- [ ] Modelo salvo em formato `.keras`.
- [ ] Manifesto salvo.
- [ ] Histórico de treino salvo.
- [ ] Métricas salvas em JSON.
- [ ] Matriz de confusão salva.
- [ ] Seed registrada.
- [ ] Versões das libs registradas.

## Modelo

- [ ] Arquitetura V6 documentada.
- [ ] Ativação de saída definida.
- [ ] Loss compatível com saída.
- [ ] Input shape registrado.
- [ ] Output classes registradas.
- [ ] Threshold registrado.
- [ ] Feature columns registradas.
- [ ] Status do modelo registrado.
- [ ] Modelo ativo aprovado manualmente.

## API

- [ ] Endpoint lista modelos.
- [ ] Endpoint retorna manifesto.
- [ ] Endpoint inicia inferência batch.
- [ ] Endpoint retorna status de job.
- [ ] Endpoint retorna frame predictions.
- [ ] Endpoint retorna eventos compactados.
- [ ] Endpoint rejeita feature schema inválido.
- [ ] Endpoint informa `model_version` em todos os resultados.
- [ ] Logs de auditoria criados.

## Pós-processamento

- [ ] Threshold parametrizável.
- [ ] `min_run_length` parametrizável.
- [ ] Eventos têm início e fim.
- [ ] Eventos têm confiança média.
- [ ] Eventos têm duração.
- [ ] Descritores por vídeo gerados.
- [ ] Comparação original vs predição implementada.

## Avaliação

- [ ] Frame-level metrics implementadas.
- [ ] Event-level metrics implementadas.
- [ ] Descriptor-level metrics implementadas.
- [ ] Accuracy não usada isoladamente.
- [ ] Relatório por fold gerado.
- [ ] Relatório agregado gerado.
- [ ] Plots gerados.
- [ ] Critério de promoção configurado.

## Frontend

- [ ] Tela de modelo mostra versão ativa.
- [ ] Tela de vídeo mostra modelo usado.
- [ ] Timeline mostra eventos.
- [ ] Tabela mostra confiança.
- [ ] Usuário consegue reprocessar vídeo.
- [ ] Alertas mostram falha de modelo/schema.
- [ ] Aviso científico exibido.

## Governança

- [ ] Resultado associado ao participante pseudonimizado.
- [ ] Resultado associado ao consentimento.
- [ ] Logs de acesso ao modelo.
- [ ] Logs de reprocessamento.
- [ ] Histórico de troca de modelo ativo.
- [ ] Política de exclusão de artefatos definida.

## Não aceitar se

- [ ] O modelo só roda dentro de notebook.
- [ ] A API depende de caminho local.
- [ ] O modelo é salvo sem manifesto.
- [ ] O frontend mostra resultado sem versão de modelo.
- [ ] A inferência aceita features fora de ordem.
- [ ] O pipeline usa scaler/PCA ajustado no teste.
- [ ] Não há separação entre frame predictions e eventos compactados.
