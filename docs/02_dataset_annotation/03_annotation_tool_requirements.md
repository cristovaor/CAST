# Fase 2 — Requisitos da Ferramenta de Anotação

## 1. Objetivo

Permitir anotação precisa e auditável de microações faciais em vídeo.

## 2. Funcionalidades P0

- Player com controle frame a frame.
- Timeline com trilhas por microação.
- Atalhos de teclado.
- Criação de eventos por intervalo.
- Edição de início/fim.
- Visualização de landmarks opcional.
- Salvamento incremental.
- Estado de tarefa: pendente, em andamento, submetida, aprovada.
- Exportação frame-level.

## 3. Funcionalidades P1

- Comparação entre dois anotadores.
- Modo revisão de conflito.
- Overlay de predição do modelo.
- Heatmap de confiança.
- Comentários por evento.

## 4. UX mínima

Layout recomendado:

```text
+----------------------------------------------------+
| Vídeo / Canvas com landmarks                       |
+----------------------------------------------------+
| controles: frame, tempo, play, velocidade          |
+----------------------------------------------------+
| trilha OF   |====|         |==|                    |
| trilha OC           |======|                       |
| trilha ML       |=|                               |
| trilha VR                                      |==| |
+----------------------------------------------------+
| painel de evento: classe, início, fim, nota        |
+----------------------------------------------------+
```

## 5. Regras técnicas

- O player deve preservar FPS real.
- O frame exibido deve corresponder ao `frame_index` persistido.
- Conversão tempo↔frame deve usar metadata do vídeo, não aproximação visual.
- A ferramenta deve impedir `NEUTRO` simultâneo com ação positiva.

## 6. API necessária

- `GET /annotation-tasks`
- `GET /videos/{id}/frames/{frame_index}/preview`
- `GET /videos/{id}/timeline`
- `POST /annotation-tasks/{id}/events`
- `PATCH /annotation-events/{id}`
- `POST /annotation-tasks/{id}/submit`
- `POST /annotation-tasks/{id}/review`

## 7. Critérios de aceite

- [ ] anotador consegue marcar 1 minuto de vídeo sem travamento;
- [ ] atalhos funcionam sem perda de foco;
- [ ] autosave a cada alteração;
- [ ] export frame-level reprodutível;
- [ ] auditoria registra quem alterou cada evento.
