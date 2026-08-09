# CAST Multimodal V8 — cabeça e EEG

## Objetivo

O V8 combina movimentos observáveis da cabeça com EEG sincronizado. O ramo de
vídeo continua funcional sem EEG; resultados neurofisiológicos só são emitidos
quando existe análise EEG válida e transformação temporal aprovada.

## Contratos

- `head-motion-v1`: landmarks 3D canônicos, gaze, abertura ocular e labial,
  pose da cabeça, derivadas temporais, fluxo óptico por ROI e qualidade visual.
- `eeg-temporal-v1`: potência logarítmica e cobertura para delta, theta, alpha,
  beta e gamma, agregadas globalmente e nas ROIs do perfil PYP EEG V2.
- `cast-multimodal-v8`: janelas centradas de cabeça e contexto EEG alinhado por
  `affine-v1`, com `eeg_present` explícito.

Sincronização não aprovada nunca é interpretada como offset zero válido.

## Treinamento

- Split por participante antes da geração de janelas.
- Cabeça é modalidade obrigatória; EEG é modalidade opcional.
- O treino multimodal exige pelo menos duas sessões com EEG e sincronização
  aprovados.
- EEG só entra na fusão quando a avaliação de qualidade registra
  `valid_ratio >= 0.70`; abaixo disso o ramo é mascarado e a condição é
  registrada na saída.
- `modality_dropout_probability=0.25` ensina o modelo a operar sem EEG.
- A calibração e compactação temporal continuam por rótulo.

## Saída

Toda predição informa:

- `modalitiesUsed`;
- `syncQuality`;
- `branchContributions`;
- `eegValidationStatus`;
- eventos observáveis e sinais contínuos.

EEG não é ground truth de microação. A correção visual deve ser avaliada contra
anotação humana; EEG fornece validação convergente e de construto.

## Validação mínima

1. F1 e PR-AUC frame/event-level contra anotação humana.
2. Comparação EEG evento versus baseline pareada, com efeito e IC.
3. Resultados separados para eventos humanos e previstos.
4. Correção de múltiplas comparações.
5. Ablation `head-only`, `eeg-only` e `head+eeg`.
6. Desempenho estratificado por qualidade e disponibilidade das modalidades.

Um artefato V8 permanece em `draft` enquanto não houver métricas por rótulo,
split separado por participante e pelo menos 20 janelas de validação com EEG
de qualidade e sincronização aprovadas.
