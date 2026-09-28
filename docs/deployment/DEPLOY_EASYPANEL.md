# CAST — Deploy na VPS Hostinger (EasyPanel)

Runbook do deploy do CAST na VPS Hostinger gerida por EasyPanel (o mesmo
projeto `doutorado` que corre o CSH-MARL), construindo as imagens localmente a
partir dos Dockerfiles do repositório (sem registry).

**O que este stack NÃO sobe:**

- **Triton** — o servidor de inferência GPU do `docker-compose.yml` está
  deliberadamente fora. A VPS não tem GPU NVIDIA; o Triton falharia ao arrancar
  ou reservaria recursos inexistentes. O worker acede ao Triton de forma
  preguiçosa via `TRITON_SERVER_URL`; como a variável não é definida, ele corre
  os modelos em CPU. Só acrescente um serviço `triton` depois de confirmar que
  o host expõe GPU **e** `nvidia-container-toolkit`.
- **Postgres e Redis** — são os serviços partilhados que já correm no EasyPanel.
  O stack liga-se a eles pela rede overlay `easypanel-doutorado`.

O MinIO **é** local ao stack, com volume próprio.

---

## 1. Pré-requisitos na VPS

Confirme que a rede overlay dos serviços partilhados existe e o nome está certo:

```bash
docker network ls | grep easypanel
```

Se o projeto EasyPanel não se chamar `doutorado`, ajuste o nome da rede no fim
do `docker-compose.easypanel.build.yml` (chave `easypanel-doutorado`).

Descubra o hostname real do Postgres/Redis partilhados:

```bash
docker service ls | grep -Ei 'postgres|redis'
```

## 2. Criar a base de dados e o role do CAST

O CAST não partilha a base de dados de outros projetos. Ligue-se ao Postgres
partilhado e crie o role e a base dedicados:

```bash
# O utilizador admin do Postgres está em EasyPanel → postgres-shared → Credentials.
docker exec -it $(docker ps -q -f name=doutorado_postgres-shared) psql -U postgres

CREATE ROLE cast_user WITH LOGIN PASSWORD 'uma-password-forte';
CREATE DATABASE cast_db OWNER cast_user;
\q
```

Gere a password com `openssl rand -hex 24`: hex não tem caracteres que
precisem de escape numa URL.

O Redis partilhado exige autenticação (utilizador `default`, password em
EasyPanel → redis-shared → Credentials). Use um índice de DB dedicado (`/3`;
o CSH-MARL usa `/0`) para as filas Celery não colidirem:

```text
REDIS_URL=redis://default:<password-do-redis>@doutorado_redis-shared:6379/3
```

Inclua `cast_db` nos backups do serviço Postgres no EasyPanel — os backups do
CSH-MARL cobrem apenas a base dele.

## 3. Configurar o Firebase (login com Google)

No [console Firebase](https://console.firebase.google.com):

1. Crie (ou reutilize) um projeto.
2. **Authentication → Sign-in method → Google → Enable.**
3. **Authentication → Settings → Authorized domains:** acrescente o domínio do
   frontend (ex.: `cast.crlabs.com.br`). Sem isto o popup é bloqueado.
4. **Project settings → Your apps → Web app:** copie `apiKey`, `authDomain`,
   `projectId` e `appId`.

`VITE_FIREBASE_PROJECT_ID` (frontend) e `FIREBASE_PROJECT_ID` (backend) têm de
ser **o mesmo valor**: o backend valida que cada ID token foi emitido para
aquele projeto, e é isso que impede alguém de apontar um projeto Firebase
próprio para esta API.

> Os valores `VITE_FIREBASE_*` são públicos por natureza — identificam o
> projeto e não autorizam nada. O controlo de acesso é feito no servidor:
> verificação do token **e** exigência de convite.

## 4. Preencher o `.env`

Na raiz do repositório, na VPS:

```bash
cp .env.easypanel.example .env
nano .env
```

Gere os segredos:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"   # SECRET_KEY
python3 -c "import secrets; print(secrets.token_urlsafe(24))"   # MINIO_ACCESS_KEY
python3 -c "import secrets; print(secrets.token_urlsafe(24))"   # MINIO_SECRET_KEY
```

Variáveis obrigatórias (o deploy falha imediatamente sem elas, por desenho):
`POSTGRES_SERVER`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `REDIS_URL`,
`SECRET_KEY`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `CORS_ORIGINS`.

## 5. Subir o stack

```bash
docker compose -f docker-compose.easypanel.build.yml up -d --build
```

A primeira build demora: a imagem do worker traz TensorFlow/MediaPipe e ocupa
vários GB. **Não a corra durante um processamento pesado.**

Acompanhe o arranque:

```bash
docker compose -f docker-compose.easypanel.build.yml ps
docker compose -f docker-compose.easypanel.build.yml logs -f backend
```

O `prestart.sh` do backend espera pela base de dados e aplica todas as migrações
Alembic até o `head` automaticamente, incluindo autenticação por convite e os
domínios multimodais/LSL/gaze/pupila.

A imagem `eeg-worker` instala os wheels científicos internos exclusivamente de
`src/vendor/wheels/`. O build executa `sha256sum -c SHA256SUMS` antes da
instalação e falha se um wheel estiver ausente ou alterado. Não remova esses
artefatos do checkout usado no deploy.

## 6. Criar o primeiro administrador

Acesso por convite tem um problema de arranque: só um admin cria convites, e
numa base nova não existe admin. O script abaixo é a via out-of-band — corre no
servidor, por quem tem shell, e é o único caminho que cria utilizador sem
convite:

```bash
docker compose -f docker-compose.easypanel.build.yml exec backend \
  python -m app.scripts.bootstrap_admin --email voce@exemplo.com --name "Seu Nome"
```

Imprime um link de convite de uso único. Abra-o e entre com a conta Google
correspondente — a conta admin é criada nesse primeiro login.

Sem Google configurado, crie um admin com password:

```bash
docker compose -f docker-compose.easypanel.build.yml exec backend \
  python -m app.scripts.bootstrap_admin --email voce@exemplo.com --name "Seu Nome" --password
```

Re-executar é seguro: um utilizador existente é promovido a admin, não duplicado.

## 7. Convidar os restantes utilizadores

Já autenticado como admin, via API (ou pelo painel de administração):

```bash
curl -X POST https://api.cast.crlabs.com.br/api/v1/invitations \
  -H "Authorization: Bearer <token-do-admin>" \
  -H "Content-Type: application/json" \
  -d '{"email":"pesquisador@exemplo.com","role":"researcher"}'
```

Papéis: `admin`, `researcher`, `annotator`, `viewer`.

A resposta traz `accept_url` — **é a única vez que o link aparece**, porque só
o hash do token é guardado. Se `SMTP_HOST` estiver configurado, o e-mail é
enviado automaticamente; caso contrário `email_error` explica que o link deve
ser partilhado à mão.

Endpoints de gestão: `GET /invitations`, `POST /invitations/{id}/resend`
(gera token novo e invalida o anterior), `DELETE /invitations/{id}` (revoga).

## 8. Encaminhamento no EasyPanel

Nenhum serviço publica portas no host — o proxy do EasyPanel encaminha para as
portas internas:

| Domínio                     | Serviço    | Porta |
| --------------------------- | ---------- | ----- |
| `cast.crlabs.com.br`        | `frontend` | 8080  |
| `api.cast.crlabs.com.br`    | `backend`  | 8080  |
| `storage.cast.crlabs.com.br`| `minio`    | 9000  |

O MinIO **tem** de estar na raiz de um subdomínio próprio: os URLs assinados
(upload de vídeo/EEG pelo browser, downloads de relatórios) são assinados
contra `MINIO_PUBLIC_URL`, e um prefixo de caminho removido pelo proxy (ex.:
`/storage`) altera o caminho assinado — o MinIO rejeita tudo com
`SignatureDoesNotMatch`. Crie o registo DNS `storage.cast` (tipo A para o IP da
VPS, no painel DNS da Hostinger) antes de configurar o domínio no EasyPanel.

A consola do MinIO (porta 9001) fica sem domínio de propósito; aceda-lhe por
túnel SSH quando precisar.

**Feature flags** (`EEG_ANALYSIS_V2_ENABLED`, `LSL_ACQUISITION_ENABLED`, …)
vêm todas desligadas por omissão; ative-as no `.env` e faça
`up -d` — o mesmo valor chega à API e aos dois workers.

---

## Operação

**Atualizar após alterações no código:**

```bash
git pull
docker compose -f docker-compose.easypanel.build.yml up -d --build
```

Alterações em `VITE_*` exigem rebuild do frontend (os valores são embutidos no
bundle em build time) — `--build` trata disso; reiniciar apenas não chega.

**Migrações** correm sozinhas no arranque do backend. Para aplicar à mão:

```bash
docker compose -f docker-compose.easypanel.build.yml exec backend alembic upgrade head
```

**Backup da base de dados** (o Postgres é partilhado — faça dump só do CAST):

```bash
docker exec <container-postgres> pg_dump -U cast_user cast_db | gzip > cast_$(date +%F).sql.gz
```

## Diagnóstico

| Sintoma | Causa provável |
| --- | --- |
| Botão "Entrar com Google" não aparece | `VITE_FIREBASE_*` vazios no build, ou `FIREBASE_PROJECT_ID` vazio no backend (`GET /api/v1/auth/providers` mostra o que o servidor reporta) |
| Popup do Google abre e fecha com erro | Domínio não está em **Authorized domains** no Firebase |
| Login devolve 401 | `VITE_FIREBASE_PROJECT_ID` ≠ `FIREBASE_PROJECT_ID` (falha na validação de audience) |
| Login devolve 403 "Acesso restrito a convidados" | Comportamento esperado: não há convite pendente para aquele e-mail |
| Backend não arranca, erro de host | `POSTGRES_SERVER`/`REDIS_URL` erradas, ou o serviço não está na rede `easypanel-doutorado` |
| Erros de CORS no browser | `CORS_ORIGINS` não inclui a origem exata do frontend (com esquema, sem barra final) |
| Upload/download falha com `SignatureDoesNotMatch` ou CORS no bucket | `MINIO_PUBLIC_URL` não é a raiz de um domínio encaminhado para `minio:9000`, ou `CORS_ORIGINS` não inclui a origem do frontend |
| Worker morre a meio de vídeos | Falta de memória: baixe `WORKER_CONCURRENCY` ou suba o limite de memória do worker |
