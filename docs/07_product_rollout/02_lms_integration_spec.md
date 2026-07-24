# Fase 7 — Especificação de Integração LMS

## 1. Objetivo

Permitir que sessões, aulas, participantes e resultados sejam conectados a plataformas de aprendizagem.

## 2. Integrações candidatas

- Moodle;
- Canvas;
- Google Classroom;
- Hotmart/MemberKit;
- LMS próprio;
- SCORM/xAPI futuro.

## 3. MVP de integração

Não integrar diretamente no MVP. Usar import/export CSV:

- participantes;
- aulas;
- pré-teste;
- pós-teste;
- resultados agregados.

## 4. API futura

Endpoints:

- importar turma;
- importar aula;
- importar notas;
- enviar relatório agregado;
- webhook de sessão concluída.

## 5. Mapeamento de dados

| CAST | LMS |
|---|---|
| study | course |
| lesson | module/activity |
| participant | learner |
| learning_session | attempt/session |
| pre/post score | grade/quiz |
| report | analytics artifact |

## 6. Regras de privacidade

- Não enviar vídeo para LMS.
- Enviar apenas métrica agregada por sessão ou grupo.
- Participante deve ser pseudonimizado quando possível.
- Integração precisa respeitar consentimento.

## 7. xAPI futuro

Eventos possíveis:

```json
{
  "actor": "participant:pseudonym",
  "verb": "completed",
  "object": "lesson:uuid",
  "result": {
    "extensions": {
      "cast:microactions_per_minute": {}
    }
  }
}
```
