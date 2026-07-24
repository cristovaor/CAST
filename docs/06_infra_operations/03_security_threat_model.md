# Fase 6 — Threat Model de Segurança

## 1. Ativos críticos

- vídeos faciais;
- landmarks;
- consentimentos;
- anotações;
- relatórios;
- modelos;
- credenciais;
- logs de auditoria.

## 2. Ameaças principais

| Ameaça | Impacto | Mitigação |
|---|---|---|
| acesso indevido a vídeo | alto | RBAC, URLs curtas, auditoria |
| vazamento de bucket | alto | bucket privado, IAM mínimo |
| exportação não autorizada | alto | permissões e logs |
| reidentificação | alto | pseudonimização e minimização |
| prompt/relatório enganoso | médio | avisos e revisão científica |
| alteração de anotação | médio | versionamento e audit log |
| modelo trocado sem revisão | médio | registry e aprovação |

## 3. Controles P0

- Auth JWT.
- RBAC.
- TLS.
- Criptografia em repouso.
- URLs pré-assinadas com TTL.
- Audit logs para download, export e deleção.
- Secrets fora do Git.
- Rate limit em endpoints sensíveis.

## 4. Controle de arquivos

- Upload direto para S3/MinIO via URL pré-assinada.
- Backend valida metadados após upload.
- Download só por URL temporária.
- Nenhum bucket público.

## 5. Logs proibidos

Não registrar:

- nome completo de participante em logs técnicos;
- URL pré-assinada completa;
- conteúdo de consentimento além de id/version;
- frames ou landmarks em log.

## 6. Testes de segurança

- tentativa de acesso cruzado a estudo;
- URL expirada;
- export sem permissão;
- deleção por usuário sem papel;
- injection em filtros;
- upload de arquivo não vídeo.
