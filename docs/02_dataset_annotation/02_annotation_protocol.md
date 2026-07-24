# Fase 2 — Protocolo de Anotação Manual

## 1. Objetivo

Criar ground truth confiável para treinamento e avaliação de microações faciais.

## 2. Unidade de anotação

O sistema deve suportar dois níveis:

1. **frame-level**: marcação binária por frame;
2. **event-level**: intervalo com início e fim.

Para treinamento LSTM original, usar frame-level. Para avaliação e UX, preferir event-level e converter para frame-level.

## 3. Microações

| Código | Nome | Definição operacional |
|---|---|---|
| OF | Olho fechado | fechamento visível de uma ou ambas as pálpebras por 1+ frames |
| OC | Olhando para canto/lado | deslocamento perceptível do olhar/íris para lateral/canto |
| ML | Mexeu lábios | movimento de lábios sem necessariamente fala audível |
| VR | Virou rosto | rotação perceptível da cabeça/face em relação à posição frontal |
| NEUTRO | Sem microação alvo | ausência das microações acima |

## 4. Regras por ação

### 4.1 OF — Olho fechado

Marcar positivo quando:

- pálpebra fecha parcial ou totalmente com redução clara da abertura ocular;
- piscada curta é válida;
- ambos os olhos ou um olho claramente fechado.

Não marcar quando:

- falha do landmark por blur;
- olho encoberto por reflexo sem movimento claro;
- face ausente.

### 4.2 OC — Olhando para canto

Marcar positivo quando:

- íris deslocada para lateral de forma perceptível;
- olhar sai da região central da tela/câmera;
- duração mínima de 1 frame.

Não marcar quando:

- cabeça virou, mas íris continua central sem evidência;
- face não detectada;
- movimento é ambíguo por resolução ruim.

### 4.3 ML — Mexeu lábios

Marcar positivo quando:

- lábio superior/inferior muda posição de forma visível;
- boca abre/fecha;
- há movimento lateral ou compressão labial.

Não marcar quando:

- movimento é causado por compressão de vídeo;
- boca está ocluída;
- apenas sombra muda.

### 4.4 VR — Virou rosto

Marcar positivo quando:

- rotação da cabeça altera orientação facial;
- nariz/contorno facial desloca de forma clara;
- rosto deixa posição frontal.

Não marcar quando:

- apenas olhos se movem;
- micro oscilação natural sem mudança perceptível.

## 5. Conflitos e simultaneidade

- OF e ML podem ocorrer simultaneamente.
- OC e VR podem ocorrer simultaneamente, mas devem ser marcados separadamente se ambos forem visíveis.
- NEUTRO é mutuamente exclusivo com qualquer microação positiva.

## 6. Dupla anotação

Regras obrigatórias:

```text
Cada vídeo deve ser anotado por 2 anotadores independentes.
Conflitos com diferença > 500 ms vão para revisão.
Calcular Cohen's Kappa por microação.
Não usar dataset para treino novo se Kappa < 0.70 na microação principal.
```

## 7. Revisão de conflito

Estados:

```text
DRAFT → SUBMITTED → CONFLICTED → REVIEWED → APPROVED
```

Critérios:

- conflito de classe: anotadores divergem sobre ação;
- conflito temporal: início/fim divergem acima da tolerância;
- conflito de qualidade: um anotador marcou frame inválido.

## 8. Atalhos da ferramenta

| Tecla | Ação |
|---|---|
| Espaço | play/pause |
| ←/→ | frame anterior/próximo |
| Shift+←/→ | 10 frames |
| 1 | OF |
| 2 | OC |
| 3 | ML |
| 4 | VR |
| 0 | NEUTRO |
| I | início evento |
| F | fim evento |
| S | salvar |

## 9. Métricas de qualidade da anotação

- Cohen's Kappa por microação.
- F1 entre anotadores por evento com tolerância ±500 ms.
- Taxa de frames ambíguos.
- Tempo médio de anotação por minuto de vídeo.

## 10. Critérios de aceite

- [ ] Guia de exemplos positivos/negativos criado.
- [ ] Dois anotadores treinados.
- [ ] Kappa calculado automaticamente.
- [ ] Conflitos resolvidos antes de treino.
- [ ] Anotações versionadas.
