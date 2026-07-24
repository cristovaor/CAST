# Fase 1 — Protocolo de Coleta de Dados

## 1. Objetivo

Padronizar a gravação de vídeos faciais para reduzir ruído causado por iluminação, câmera, posição, oclusões e variação de ambiente. Sem esse protocolo, o modelo pode aprender artefatos de coleta em vez de microações.

## 2. Cenário de coleta

O participante assiste a uma aula multimídia gravada ou controlada enquanto sua face é gravada pela webcam/câmera frontal.

Fluxo mínimo:

```text
Consentimento → Pré-teste → Calibração de câmera → Gravação → Pós-teste → Upload → Validação de qualidade
```

## 3. Especificação mínima do vídeo

| Item | Valor mínimo | Valor recomendado |
|---|---:|---:|
| Resolução | 1280x720 | 1920x1080 |
| FPS | 24 | 30 |
| Codec | H.264 | H.264/H.265 |
| Formato | MP4 | MP4 |
| Duração | 60s | 180s+ |
| Orientação | paisagem | paisagem |
| Áudio | opcional | desligado se não necessário |

## 4. Posição da câmera

- Câmera na altura dos olhos.
- Face centralizada.
- Distância aproximada: 40 cm a 80 cm.
- Rosto ocupando entre 8% e 45% da área do frame.
- Evitar ângulo lateral superior a 20 graus.
- Evitar câmera abaixo do queixo.

## 5. Iluminação

- Fonte de luz frontal ou lateral suave.
- Evitar contraluz forte.
- Evitar ambiente escuro.
- Evitar luz piscante ou tela como única fonte de iluminação.

Critério automático recomendado:

```text
brightness_mean entre 50 e 205
brightness_std >= 15
face_detected_rate >= 0.90
```

## 6. Oclusões

Rejeitar ou marcar como degradado quando houver:

- máscara facial;
- boné cobrindo testa/olhos;
- mão no rosto por longos períodos;
- câmera muito baixa;
- cabelo cobrindo olhos;
- óculos com reflexo persistente;
- fone/microfone cobrindo boca em tarefas de lábio.

Óculos comuns são permitidos se não impedirem detecção de íris/olhos.

## 7. Check inicial do participante

Antes da gravação, o frontend deve exibir uma tela de calibração:

- rosto centralizado;
- iluminação adequada;
- olhos visíveis;
- boca visível;
- sem máscara;
- câmera estável;
- fundo não crítico.

## 8. Critérios automáticos de aceite

```text
video_quality_status = ACCEPTED se:
- duration_seconds >= 60
- fps >= 24
- width >= 1280
- height >= 720
- face_detected_rate >= 0.90
- no_face_gap_max_seconds <= 2.0
- face_bbox_area_ratio_median entre 0.08 e 0.45
- blur_score_median >= threshold definido por calibração
```

```text
video_quality_status = DEGRADED se:
- face_detected_rate entre 0.75 e 0.90
- no_face_gap_max_seconds <= 5.0
- blur/iluminação parcialmente fora dos thresholds
```

```text
video_quality_status = REJECTED se:
- face_detected_rate < 0.75
- máscara detectada ou oclusão severa
- duração < 60s
- fps < 15
```

## 9. Metadados obrigatórios de coleta

```json
{
  "participant_pseudonym": "P001",
  "study_id": "uuid",
  "session_id": "uuid",
  "lesson_id": "uuid",
  "recorded_at": "2026-06-13T10:00:00-03:00",
  "device_type": "webcam",
  "camera_resolution": "1920x1080",
  "fps": 30,
  "environment": "lab|home|classroom",
  "lighting_notes": "front light",
  "glasses": false,
  "mask": false,
  "pre_test_score": 6.0,
  "post_test_score": 9.0
}
```

## 10. Checklist do operador

- [ ] Consentimento registrado.
- [ ] Pré-teste aplicado.
- [ ] Câmera calibrada.
- [ ] Face visível.
- [ ] Boca visível.
- [ ] Olhos visíveis.
- [ ] Sem máscara.
- [ ] Iluminação adequada.
- [ ] Sessão gravada sem interrupção.
- [ ] Pós-teste aplicado.
- [ ] Vídeo validado pelo sistema.

## 11. Critério de saída da fase

A fase de coleta está pronta quando 10 vídeos piloto passam pelo protocolo e pelo menos 80% são classificados como `ACCEPTED`.
