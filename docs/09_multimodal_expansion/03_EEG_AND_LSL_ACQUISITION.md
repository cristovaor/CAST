# 03 — EEG e aquisição LSL

## Objetivo

Gravar streams LSL e markers CAST em XDF por um agente local, catalogar a
gravação, materializar um ativo EEG reproduzível e reutilizar os contratos de
qualidade, sincronização e análise EEG já existentes.

## Estado

- Banco, API, upload XDF e catálogo de streams: implementados pela migração
  `022` e pelo domínio `app/domains/lsl`.
- Agente loopback, discovery, seleção, markers e controle do LabRecorder:
  implementados; aguardam ensaio com hardware e LabRecorder reais.
- Materialização XDF → CSV EEG, tiles e evidência de sincronização:
  implementada; aguarda arquivo golden XDF real.
- Track EEG no Explorer: implementada.

O estado formal e as evidências permanecem no
[`00_INDEX.md`](00_INDEX.md); este documento descreve o contrato operacional.

## Dependências e não objetivos

Dependências: contratos temporais, upload S3, `EEGAsset`, worker EEG,
`SyncEvidence`/`SyncRun`, `pyxdf`, MNE e LabRecorder.

Não objetivos: manter uma task Celery durante toda a gravação, fornecer driver
universal de hardware, tratar EEG como ground truth cognitivo ou aprovar
sincronização automaticamente.

## Agente local

O pacote `agents/cast-lsl-agent`:

- escuta apenas em `127.0.0.1`;
- exige `CAST_LSL_PAIR_TOKEN` único e allowlist de origens;
- aceita somente um template de comando LabRecorder contendo `{output}` e,
  opcionalmente, `{streams}`;
- grava localmente e faz upload do XDF imutável apenas após `/stop`;
- torna `/marker` idempotente por `client_event_id`.

O payload LSL do marker é JSON compacto no schema `cast-marker-v1`:

```json
{
  "schema_version": "cast-marker-v1",
  "client_event_id": "uuid",
  "label": "CAST marker",
  "source_time_us": 123456,
  "source_clock_id": "browser-performance"
}
```

`source_time_us` só é interpretável junto de `source_clock_id`; a conversão
para tempo canônico deve preservar incerteza e evidência de sincronização.

## Backend e materialização

A migração `022` cria `LSLRecording` e o catálogo de streams. As APIs são
session-scoped e cobrem criação, snapshot de discovery, conclusão, estado e
proveniência.

Na materialização, exatamente um stream EEG deve ser selecionado. O worker:

1. preserva o XDF como membro `source`;
2. converte o stream EEG para CSV mantendo o tempo LSL;
3. calcula SHA-256 e registra o CSV como o único `EEGAssetFile` `primary`;
4. cria/reutiliza o `EEGAsset`, tiles e evidências de sync;
5. encaminha análise científica longa para a fila `eeg`, nunca para o agente.

Mais de um membro primário invalida o bundle. Ativos legados sem membro
primário permanecem legíveis por fallback em `EEGAsset.storage_uri`.

## Frontend

O console permite pareamento, discovery, seleção de streams, inspeção de taxa,
canais e duração, emissão de marker e início/fim da gravação. A interface deve
deixar explícito que discovery não valida qualidade, que perda pode ocorrer e
que a sincronização exige revisão humana.

## Experimento e testes pendentes

Executar gravações câmera/LSL com markers conhecidos, desconexões controladas e
taxas distintas. Medir offset, drift, perda e incerteza. Cobrir:

- ausência ou ambiguidade de stream EEG;
- marker duplicado e reconexão;
- XDF inválido e isolamento entre organizações;
- retry/reuse e consistência PTS–LSL–EEG–eventos;
- LabRecorder/hardware real e golden XDF no worker `pyxdf`.

## Critérios de aceite e rollback

Aceite: XDF imutável com checksum, streams catalogados, um derivado EEG
primário verificável, tiles limitados, markers estruturados, evidência de sync
auditável e aprovação humana obrigatória.

Rollback: desabilitar `LSL_ACQUISITION_ENABLED`, revogar pares e parar o agente,
mantendo XDF, catálogo e artefatos existentes legíveis.

Tarefas rastreadas: `EEG-001`, `EEG-002`, `EEG-003`, `EEG-004`.
