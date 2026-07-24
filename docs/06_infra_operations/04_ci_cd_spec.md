# Fase 6 — Especificação de CI/CD

## 1. Branches

```text
main: produção
staging: homologação
feature/*: desenvolvimento
```

## 2. Pipeline backend

Etapas:

1. lint;
2. type check;
3. unit tests;
4. integration tests com Postgres/Redis;
5. security scan;
6. build Docker;
7. push image;
8. deploy staging;
9. smoke test.

## 3. Pipeline frontend

Etapas:

1. install;
2. lint;
3. type check;
4. unit tests;
5. build;
6. e2e smoke;
7. deploy.

## 4. Pipeline ML

Etapas:

1. validar schema dataset;
2. rodar testes de features;
3. treinar em subset;
4. avaliar métricas;
5. registrar artefatos;
6. bloquear promoção se métricas abaixo do threshold.

## 5. Gates obrigatórios

- Cobertura unitária backend >= 70% no MVP.
- OpenAPI validado.
- Migrations testadas do zero.
- Nenhum secret no repositório.
- Teste de job de vídeo sintético.

## 6. Versionamento

- Backend: semver por release.
- Frontend: semver por release.
- Modelo: versão própria no registry.
- Pipeline: `pipeline_version` separada.

## 7. Critério de aceite

- [ ] PR não passa sem testes;
- [ ] deploy staging automatizado;
- [ ] rollback documentado;
- [ ] migrations verificadas;
- [ ] OpenAPI publicado como artefato.
