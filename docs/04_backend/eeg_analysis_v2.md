# EEG Analysis V2

## Escopo

O CAST executa análises EEG por meio da distribuição interna
`cast-pyp-eeg==2.0.0+cast.4074a2a`. A fonte adaptada está em
`src/vendor/cast_pyp_eeg/` e os wheels usados no deploy estão em
`src/vendor/wheels/`.

As rotinas científicas são importadas somente pelo worker EEG. A API e o
worker de vídeo não instalam MNE, ICLabel ou MDMP.

## Proveniência e licenças

- Pyp-EEG: commit `4074a2a391aec435a1987c0f7ea0c1183bf7eb96`,
  licença CC BY 4.0.
- MDMP 0.6.2: commit `420afe67cf89e0a656fd5346c3721063365c40e4`,
  licença GPL-3.0.
- A adaptação não é uma distribuição oficial e não implica endosso dos
  autores originais.

Os detalhes das mudanças e avisos estão em `src/vendor/cast_pyp_eeg/UPSTREAM.md`
e `src/vendor/cast_pyp_eeg/CHANGES.md`.

## Build reprodutível

Execute na raiz do repositório:

```powershell
pwsh -File src/vendor/build_wheels.ps1 -MdmpSource C:\caminho\para\mdmp
```

O script usa árvores limpas dos commits fixados, define `SOURCE_DATE_EPOCH`,
executa `python -m build`, valida com `twine check` e atualiza
`src/vendor/wheels/SHA256SUMS`. O container instala os dois wheels com
`--no-index --no-deps`; as dependências científicas fixas estão em
`src/requirements-eeg.txt`.

`MdmpSource` deve apontar para um checkout local limpo no commit MDMP fixado;
o build falha se o `HEAD` for diferente e nunca baixa código Git.

## Runtime

O serviço `eeg-worker` usa `src/Dockerfile.eeg-worker`, consome apenas a fila
Celery `eeg` e inicia com concorrência 1. O worker padrão consome somente
`celery`.

O PyTorch transitivo usado pelo `pgmpy` é instalado pelo índice CPU oficial,
na versão fixada em `requirements-eeg.txt`; imagens CUDA não fazem parte do
worker. O `pgmpy` é instalado sem dependências transitivas opcionais de
XGBoost/APIs generativas, que não participam do caminho HC usado pelo MDMP;
o smoke test científico valida esse runtime reduzido.

Recursos iniciais recomendados:

- 2 CPUs;
- 4–6 GB de memória;
- prefetch Celery igual a 1.

A funcionalidade é coordenada pela flag `EEG_ANALYSIS_V2_ENABLED`. Ela deve
ser habilitada simultaneamente na API e no worker EEG somente depois da
migração `018`.

## Persistência

A migração `018` adiciona:

- `eeg_asset_files`: manifesto dos arquivos primários e auxiliares;
- `eeg_analysis_runs`: configuração, estado, versões, hashes e proveniência;
- `eeg_analysis_artifacts`: resultados versionados, checksums e unidades;
- `processing_jobs.eeg_asset_id` e o tipo de job `eeg_analysis`.

Ativos legados são preservados e recebem uma entrada primária derivada de
`storage_uri`.

## API

Uploads:

- `POST /api/v1/eeg/uploads/init`
- `POST /api/v1/eeg/{eeg_id}/uploads/complete`

Execução:

- `POST|GET /api/v1/eeg/{eeg_id}/analysis-runs`
- `POST|GET /api/v1/studies/{study_id}/eeg-analysis-runs`
- `GET /api/v1/eeg/analysis-runs/{run_id}`
- `GET /api/v1/eeg/analysis-runs/{run_id}/artifacts`
- `GET /api/v1/eeg/analysis-runs/{run_id}/artifacts/{artifact_id}/download`

Resultados `eeg-result-v1`:

- `power`
- `timeseries`
- `stats`
- `topomaps`
- `mdmp`

Jobs EEG reutilizam `/api/v1/jobs/{id}`, SSE, cancelamento e retry.

## Operação e segurança

Cada run usa um diretório temporário isolado. O worker baixa o bundle do
MinIO, valida nomes e referências internas, executa as etapas selecionadas,
publica derivados em `eeg/{asset}/analyses/{run}/` e remove o diretório
temporário ao terminar.

Bundles BrainVision devem conter `.vhdr`, `.eeg` e `.vmrk`. ZIPs BIDS têm
limites de quantidade, tamanho e taxa de compressão, e entradas com path
traversal são rejeitadas.

Runs concluídos são deduplicados pelo hash das entradas e da configuração.
Falhas tardias preservam artefatos válidos e produzem estado `partial`.
Downloads públicos usam URL assinada e nunca expõem a URI interna do MinIO.

## Perfil científico

O perfil padrão é genérico. `pyp_eeg_v2` é um preset explícito que reproduz
os valores originais do projeto, mas nunca é aplicado silenciosamente.
Grupos, condições, bandas, blocos, ROIs e contrastes pertencem à configuração
do run ou ao desenho do estudo.

Resultados devem ser interpretados como associações descritivas. A interface
exibe unidades, amostra, exclusões, filtros, hashes, versão metodológica e
ressalvas não causais.

## Validação integrada

Além dos testes unitários e do smoke científico do wheel, o script
`src/tests/integration/eeg_stack_smoke.py` valida o caminho operacional real:
gera um FIF sintético, envia o job pela fila Celery `eeg`, acompanha o run em
um PostgreSQL descartável, grava e relê os derivados no MinIO e confere tamanho,
SHA-256, proveniência, `worker_id` e o envelope `eeg-result-v1`.

O script deve ser executado somente com `POSTGRES_DB` apontando para um banco
descartável já inicializado no schema atual. Ele remove os objetos criados no
MinIO; a automação chamadora continua responsável por encerrar o worker
temporário, limpar o banco Redis isolado e remover o banco PostgreSQL.
