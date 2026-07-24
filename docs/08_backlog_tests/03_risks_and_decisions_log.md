# Fase 8 — Registro de Riscos e Decisões

## Riscos

| ID | Risco | Prob. | Impacto | Mitigação | Dono |
|---|---|---:|---:|---|---|
| R01 | dataset pequeno | alta | alto | coletar mais dados | ML |
| R02 | anotação inconsistente | alta | alto | dupla anotação + Kappa | Pesquisa |
| R03 | LGPD insuficiente | média | alto | jurídico/DPO/RIPD | Produto |
| R04 | modelo confundido com diagnóstico | média | alto | texto de cautela | Produto |
| R05 | vídeos ruins | alta | alto | protocolo e quality gate | Dados |
| R06 | custo de processamento | média | médio | batch CPU + GPU opcional | Infra |
| R07 | pipeline lento | média | médio | workers e filas | Backend |
| R08 | UX de anotação ruim | média | alto | teste com anotadores | Frontend |

## Decisões pendentes

| ID | Decisão | Opções | Recomendação |
|---|---|---|---|
| D01 | React Vite ou Next.js | Vite/Next | Vite para app interno; Next se precisar SSR público |
| D02 | Celery ou RQ | Celery/RQ | RQ no MVP; Celery se workflows complexos |
| D03 | MLflow ou registry próprio | MLflow/próprio | registry próprio simples inicialmente |
| D04 | Armazenar z | sim/não | armazenar bruto, não usar no modelo v1 |
| D05 | Frame debug | sim/não | só com TTL e flag |

## Go/No-Go para piloto

Go se:

- protocolo de coleta aprovado;
- consentimento aprovado;
- pipeline processa 10 vídeos;
- anotação funciona;
- exportação sem dados identificáveis.

No-go se:

- ausência de consentimento;
- qualidade de vídeo abaixo do mínimo;
- Kappa abaixo de 0.70 sem plano de correção;
- API sem controle de acesso.
