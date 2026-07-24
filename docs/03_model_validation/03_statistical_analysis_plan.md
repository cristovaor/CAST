# Fase 3 — Plano de Análise Estatística

## 1. Objetivo

Definir como relacionar microações faciais com ganho de aprendizagem sem inferir causalidade indevida.

## 2. Hipóteses

H1: a frequência de algumas microações difere entre tipos de aula multimídia.  
H2: descritores de microações estão associados ao ganho de aprendizagem.  
H3: padrões temporais de microações diferem entre grupos R e NR.

## 3. Variáveis

### Independentes

- tipo de aula: R/NR;
- segmento temporal da aula;
- características do material;
- qualidade do vídeo;
- participante.

### Dependentes

- ganho absoluto: `post_test - pre_test`;
- ganho relativo: `(post - pre) / max_score`;
- contagem de microações;
- microações por minuto;
- proporção temporal de microações.

### Covariáveis

- nota pré-teste;
- qualidade do vídeo;
- duração da sessão;
- face detected rate;
- presença de óculos;
- ambiente de coleta.

## 4. Análise descritiva

Gerar:

- distribuição de pré/pós-teste;
- boxplot de ganho por tipo de aula;
- contagem de microações por vídeo;
- microações por minuto;
- timeline agregada por segmento.

## 5. Testes estatísticos

Para N pequeno:

- Wilcoxon/Mann-Whitney para comparação R vs NR;
- Spearman para correlação microação↔ganho;
- bootstrap para intervalo de confiança.

Para N médio/grande:

- regressão robusta;
- modelos mistos com participante como efeito aleatório;
- correção de múltiplas comparações Benjamini-Hochberg.

## 6. Segmentação temporal

Dividir cada vídeo em janelas percentuais:

```text
0-20%, 20-40%, 40-60%, 60-80%, 80-100%
```

Calcular microações por minuto em cada segmento para comparar padrões no tempo.

## 7. Relato de resultados

Todo resultado deve conter:

- tamanho da amostra;
- métrica central;
- intervalo de confiança;
- p-valor quando aplicável;
- tamanho de efeito;
- limitação de interpretação.

## 8. Interpretação permitida

Permitido:

> Houve associação entre maior frequência de OC e menor/maior ganho no conjunto analisado.

Não permitido:

> OC causa baixa aprendizagem.

## 9. Critérios para publicação/relatório externo

- N >= 30 recomendado para análise exploratória mais estável.
- Dataset balanceado por tipo de aula sempre que possível.
- Exclusão de vídeos deve ser reportada.
- Análise de sensibilidade removendo vídeos degradados.

## 10. Artefatos de saída

- `analysis_report.html`
- `statistical_summary.json`
- `figures/*.png`
- `tables/*.csv`
- notebook reexecutável ou script CLI.
