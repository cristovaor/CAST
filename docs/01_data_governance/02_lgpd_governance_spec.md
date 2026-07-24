# Fase 1 — Especificação de Governança LGPD

## 1. Aviso

Este documento é uma especificação técnica e operacional, não parecer jurídico. Deve ser revisado por jurídico/DPO antes de produção.

## 2. Dados tratados

| Categoria | Exemplos | Sensibilidade operacional |
|---|---|---|
| Identificação administrativa | nome, e-mail, instituição | dado pessoal |
| Pseudônimo de participante | P001, P002 | dado pessoal pseudonimizado |
| Vídeo facial | MP4 da face | alto risco/sensível na prática |
| Landmarks faciais | pontos FaceMesh, íris, boca | derivado biométrico/comportamental |
| Anotações | OF, OC, ML, VR por frame/evento | dado derivado |
| Testes educacionais | pré/pós-teste | dado educacional |
| Logs | acesso, download, deleção | dado operacional |

## 3. Base normativa de referência

- Lei Geral de Proteção de Dados Pessoais — Lei nº 13.709/2018, texto compilado no Planalto.
- ANPD — orientações sobre Relatório de Impacto à Proteção de Dados Pessoais (RIPD).
- ANPD — discussões e orientações recentes sobre dados biométricos e reconhecimento facial.

## 4. Papéis

| Papel | Responsável |
|---|---|
| Controlador | instituição/projeto que define finalidade e meios |
| Operador | equipe/empresa que processa dados sob instrução |
| Encarregado/DPO | pessoa indicada para comunicação com titulares e ANPD |
| Titular | participante gravado |
| Usuário autorizado | pesquisador, professor, anotador ou admin |

## 5. Finalidades permitidas

- Pesquisa educacional.
- Avaliação exploratória de material multimídia.
- Treinamento e validação de modelos de microação.
- Geração de descritores agregados.
- Auditoria científica e reprodutibilidade.

Finalidades proibidas sem nova base/consentimento:

- identificação biométrica;
- vigilância disciplinar;
- avaliação individual automatizada;
- decisão de nota/aprovação;
- inferência clínica;
- compartilhamento comercial de vídeo bruto.

## 6. Consentimento

O consentimento deve ser:

- livre;
- informado;
- inequívoco;
- específico por finalidade;
- registrável;
- revogável.

Campos mínimos:

```json
{
  "participant_id": "uuid",
  "consent_version": "v1.0",
  "accepted_at": "timestamp",
  "accepted_by": "participant|guardian",
  "purposes": ["research", "model_training", "educational_analysis"],
  "allow_video_storage": true,
  "allow_landmark_storage": true,
  "allow_model_training": true,
  "retention_days": 365,
  "withdrawal_channel": "email or portal",
  "ip_hash": "sha256"
}
```

## 7. Retenção

| Artefato | Retenção padrão | Observação |
|---|---:|---|
| Vídeo bruto | 365 dias | configurável por estudo |
| Frames debug | 7 dias | desativado por padrão |
| Landmarks | 365 dias | excluir junto com vídeo se titular solicitar |
| Anotações | 365 dias ou fim do estudo | manter agregados anonimizados se juridicamente permitido |
| Métricas agregadas | indeterminado | apenas se anonimização real |
| Logs de auditoria | 5 anos | sem conteúdo sensível além do mínimo |

## 8. Pseudonimização

- Participantes devem usar identificador aleatório.
- Tabela de vínculo identidade ↔ pseudônimo deve ficar separada e com acesso restrito.
- Exportações padrão não devem incluir nome, e-mail ou identificador institucional.

## 9. Exclusão e revogação

Quando o titular solicitar exclusão:

1. marcar solicitação em `data_subject_requests`;
2. bloquear novos processamentos;
3. apagar vídeo bruto;
4. apagar frames debug;
5. apagar landmarks vinculáveis;
6. apagar anotações vinculáveis ou dissociar conforme base jurídica;
7. invalidar exports pendentes;
8. registrar auditoria sem manter conteúdo sensível.

## 10. Controle de acesso

| Papel | Vídeo | Landmarks | Anotação | Relatório | Admin |
|---|---|---|---|---|---|
| admin | sim | sim | sim | sim | sim |
| researcher | sim, se autorizado | sim | sim | sim | não |
| annotator | frames/timeline necessários | limitado | sim | não | não |
| viewer | não | não | não | sim agregado | não |

## 11. Segurança

- TLS obrigatório.
- Criptografia em repouso no storage.
- URLs pré-assinadas com expiração curta.
- Segregação de buckets por ambiente.
- Logs de download de vídeo.
- MFA para admins.
- Secrets fora do repositório.
- Backup criptografado.

## 12. RIPD

Recomenda-se RIPD antes da produção porque há vídeo facial e dados derivados de comportamento. O RIPD deve cobrir:

- finalidade;
- necessidade;
- proporcionalidade;
- ciclo de vida dos dados;
- riscos aos titulares;
- medidas de segurança;
- bases legais;
- compartilhamentos;
- procedimento de incidente.

## 13. Textos obrigatórios no produto

O relatório deve incluir aviso:

> Os indicadores apresentados são exploratórios e derivados de microações faciais detectadas em vídeo. Eles não constituem diagnóstico clínico, psicológico ou avaliação definitiva de carga cognitiva individual.

## 14. Critério de aceite

- [ ] Consentimento versionado implementado.
- [ ] Exclusão de titular testada ponta a ponta.
- [ ] Download de vídeo auditado.
- [ ] Landmarks tratados como dado derivado sensível.
- [ ] Retenção configurável por estudo.
- [ ] RIPD iniciado antes de produção.
