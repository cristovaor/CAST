# CAST Unified V7 — execução do piloto

## Objetivo e limite de uso

O `cast-unified-v7` é um modelo temporal multirrótulo para anotação
assistida. Ele sugere movimentos faciais observáveis, intervalos, atributos
espaciais e confiança; nenhuma sugestão é convertida em anotação definitiva
sem aceite, correção ou rejeição humana.

O modelo não infere emoção, intenção, diagnóstico ou estado mental.

## Contrato unificado

As cinco ações canônicas permanecem compatíveis com os consumidores V6:

| Código | Movimento | Atributos principais |
| --- | --- | --- |
| `OF` | fechamento ocular | lado e subtipo `blink`, `wink` ou `sustained_closure` |
| `OC` | desvio do olhar | horizontal e vertical |
| `ML` | movimento labial | magnitude e sinais da boca |
| `VR` | movimento da cabeça | yaw, pitch, roll e direção |
| `MSO` | movimento de sobrancelha | lado, magnitude e assimetria |

Também são sugeridos, como rótulos experimentais independentes:
`SMILE`, `MOUTH_OPEN`, `LIP_PRESS`, `LIP_PUCKER`, `BROW_RAISE`,
`BROW_FURROW` e `SQUINT`.

O artefato é registrado com `action="MULTI"` e arquitetura
`cast-unified-v7`. O manifesto é a fonte de verdade para a ordem das features,
cabeças de saída, rótulos, calibração e tolerâncias.

## Fluxo dos dez vídeos

Antes de qualquer inspeção de resultado, registrar os dois vídeos de holdout
em uma ata imutável. Os oito vídeos restantes formam o conjunto de
desenvolvimento.

1. Importar os dez vídeos e executar a extração FaceMesh 3D.
2. Definir dois vídeos completos como holdout.
3. Anotar sem sugestões trechos de início, meio e fim dos oito vídeos.
4. Gerar candidatos geométricos de alta cobertura para os demais trechos.
5. Aceitar, corrigir ou rejeitar todos os candidatos, registrando o tempo.
6. Treinar nos oito vídeos com separação exclusivamente por vídeo.
7. Calibrar limiares e tolerâncias com validação leave-one-video-out.
8. Anotar os dois holdouts sem predições visíveis.
9. Executar uma única avaliação final no holdout.
10. Repetir uma amostra após alguns dias para medir consistência
    intra-anotador e realizar a segunda passagem de revisão.

Os IDs dos holdouts, a versão das anotações, a versão da calibração e o hash
dos arquivos devem acompanhar o relatório final.

## Predição e revisão

O resultado V7 expõe `events`, preservando eventos simultâneos. Cada evento
inclui `actionCode`, frames e tempos inicial/final, confiança, lado, direção,
subtipo, magnitude, sinais contínuos e qualidade. O campo legado `actions`
continua sendo preenchido para clientes V6.

Na tela de anotação, as sugestões são agrupadas por olhos, olhar, cabeça,
boca e sobrancelhas. Filtros e operações em lote não dispensam a revisão
humana. Quando o intervalo é corrigido, a sugestão original permanece no
registro de auditoria.

## Gate de promoção

Todo treino V7 nasce como `draft`. O serviço impede a ativação quando qualquer
uma das cinco ações:

- não possui métricas;
- possui suporte de validação menor que 20;
- possui recall menor que 0,80;
- ou quando o recall macro das cinco ações é menor que 0,90.

O gate automático é apenas a primeira barreira. A promoção operacional ainda
exige relatório do holdout com:

- recall macro de eventos de pelo menos 0,90;
- erro mediano de borda de no máximo 200 ms;
- macro-F1 de direção de pelo menos 0,80;
- redução de pelo menos 30% no tempo de anotação;
- detecção facial adequada, ausência de vazamento entre vídeos e métricas
  estratificadas por ação, lado, direção, participante e qualidade.

Movimentos adicionais com menos de 20 eventos no holdout permanecem
experimentais e não bloqueiam o piloto.

## Verificação técnica

Antes de iniciar o piloto:

```powershell
cd E:\CAST\src
python -m pytest tests/cast/test_unified_features.py tests/cast/test_unified_model_shape.py tests/cast/test_unified_postprocessing.py tests/services/test_unified_model_promotion.py -q

cd E:\CAST\frontend
npm.cmd run build
```

Um teste ponta a ponta deve percorrer: vídeo → landmarks → sinais → modelo
único → intervalos → sugestões → revisão humana → exportação CSV/JSON.

