# CAST Pro — Evolução multimodal da interface

Reposicionamento do frontend de um app enviesado ao cenário educacional para um
**ambiente científico multimodal, configurável e reutilizável**, centrado na
análise sincronizada de **vídeo + EEG + eventos experimentais**.

Stack: Vite + React 19 + TypeScript + Tailwind v4 + React Router 7. Build e
lint validados (novos arquivos sem erros; os 33 erros de lint remanescentes são
dívida pré-existente em arquivos não tocados).

---

## 1. Diagnóstico da UI atual

| Problema | Impacto científico | Impacto operacional | Risco | Esforço | Prioridade | Recomendação |
|---|---|---|---|---|---|---|
| Wizard de sessão obrigava pré-teste e pós-teste | Impõe desenho educacional a qualquer estudo | Fricção em coletas não-educacionais | Alto | M | P0 | Substituído por modalidades opcionais |
| Campo "Aula / material assistido" obrigatório | Assume aprendizagem como fenômeno | Bloqueia sessões genéricas | Alto | P | P0 | Trocado por condição/protocolo/operador |
| EEG tratado como "opcional (Test)" e secundário | Quebra a paridade vídeo↔EEG | Sinal subvalorizado | Alto | M | P0 | EEG como modalidade central; tela de qualidade dedicada |
| Ausência de sincronização como conceito | Sem alinhamento temporal formal | Análise multimodal inviável | Alto | G | P0 | Nova tela de sincronização com âncoras/drift/decisão |
| Sem workspace de análise sincronizada | Vídeo e EEG nunca no mesmo eixo | Exploração fragmentada | Alto | G | P0 | Workspace com player + EEG + timeline multimodal |
| Linguagem determinística ("carga cognitiva", "diagnóstico") | Correlação apresentada como causa | Risco ético/reputacional | Alto | P | P0 | Banners de ressalva; texto conservador |
| Navegação de 4 grupos sem datasets/governança | AI limitada | Fluxos científicos incompletos | Médio | M | P1 | 14 seções (docs §6) |
| Nav de estudo só overview/participantes/sessões | Sem protocolo/hipóteses/variáveis | Estudo raso | Médio | M | P1 | Nav contextual de 12 abas |
| Sem datasets versionados/manifesto | Sem reprodutibilidade | Exportações não rastreáveis | Alto | G | P1 | Gestão de datasets com manifesto completo |
| Sem registro de variáveis científicas | Papéis (IV/DV/covariável) não modelados | Plano de análise informal | Médio | M | P1 | Registro de variáveis (§14) |
| Métricas sem contexto (n, unidade, versões) | Gráficos não interpretáveis | Decisão sobre dado incompleto | Médio | M | P2 | `ChartFrame` com metadados obrigatórios |
| Governança ausente da UI | Dados sensíveis sem controle visível | Exposição LGPD | Alto | M | P1 | Tela de governança + auditoria + alertas |

---

## 2. Nova arquitetura de páginas / mapa de rotas

Navegação global (14 seções, docs §6): Visão geral · Projetos · Estudos ·
Participantes · Sessões · Aquisição · Processamento · Anotação · Análises ·
Datasets · Modelos · Relatórios · Governança · Administração.

Rotas adicionadas/alteradas (`src/app/routes.tsx`):

```
/app/studies/new                       → NewStudyPage (wizard configurável)
/app/studies/:id/{protocol,hypotheses,conditions,variables,
                  sync,quality,analysis,datasets,settings}
/app/participants                      → global
/app/sessions/:id                      → hub multimodal
/app/sessions/:id/eeg                  → importação & qualidade EEG
/app/sessions/:id/sync                 → sincronização vídeo↔EEG
/app/sessions/:id/analysis             → workspace sincronizado
/app/acquisition                       → aquisição de dados
/app/analysis                          → índice de análises configuráveis
/app/datasets                          → datasets versionados
/app/governance                        → governança, ética e privacidade
```

Breadcrumb de estudo: `Projetos / Neuroergonomia 2026 / Estudo de fadiga / …`.

---

## 3. Fluxos multimodais

- **Criar estudo**: informações → questão & hipóteses → desenho (13 opções,
  não só pré/pós) → modalidades (vídeo+EEG núcleo; testes opcionais) →
  governança → revisão & ativação.
- **Coletar sessão**: sessão → vídeo → EEG → auxiliares (opcional) → revisão →
  "pronta para sincronização".
- **Sincronizar**: método → âncoras → offset/drift → aprovar/invalidar +
  justificativa → histórico.
- **Analisar**: player de vídeo + canais EEG + timeline multimodal com faixas
  por proveniência; seletor de análise (Temporal/Vídeo/EEG/Multimodal/Estatística).
- **Dataset reprodutível**: seleção → critérios → transformações → versão →
  manifesto → congelar → exportar.

---

## 4. Design system criado

- `ToneBadge` — status neutro por `DataTone` (sessão, qualidade, sync, dataset).
- `ScientificCaveat` — banners não-determinísticos (associação/privacidade/modelo/qualidade).
- `ChartFrame` — contrato de metadados obrigatório de gráfico (§20).
- `ProvenanceLegend` / `ProvenanceDot` — distinção visual das 10 naturezas de dado.
- `QualityFindings` — problema → evidência → impacto → ação → reprocessável.
- `research.ts` — tipos canônicos: desenhos, modalidades, variáveis, hipóteses,
  estados de sessão/sync/dataset, verdicts de qualidade, riscos de modelo, proveniência.

---

## 5. Páginas criadas / refatoradas

**Novas:** `SessionDetailPage`, `EEGQualityPage`, `SyncPage`,
`AnalysisWorkspacePage`, `AnalysisIndexPage`, `DatasetsPage`, `GovernancePage`,
`AcquisitionPage`, `VariablesPage`, `NewStudyPage`, `StudySectionPages`
(protocolo, hipóteses, condições, qualidade, datasets, análise, config).

**Refatoradas:** `Sidebar` (14 seções), `StudyLayout` (12 abas + breadcrumb),
`SessionWizardLayout` + `SessionForms` (modalidades opcionais, EEG co-central),
`VideoDetailPage` (linguagem conservadora), `CreateStudyDialog` (placeholder neutro).

---

## 6. Riscos científicos e de privacidade

- **Científico**: mock data não substitui validação estatística; a UI nunca
  recomenda teste sem premissas; associações rotuladas como não-causais.
- **Privacidade**: vídeo facial e EEG são sensíveis — governança embute
  pseudonimização, consentimento, finalidade, retenção, auditoria e alertas de
  reidentificação. Dados brutos não são compartilháveis sem autorização.

## 7. Limitações remanescentes / backlog priorizado

- P1: conectar telas a endpoints reais (hoje mock em `multimodalMocks.ts`).
- P1: upload real de EEG + parser de metadados (EDF/BrainVision/FIF).
- P2: renderização de EEG com dados reais (espectrograma, topografia, ICA).
- P2: seleção de intervalo/exportação funcional no workspace.
- P2: dupla anotação cega + adjudicação; anotação configurável por esquema.
- P3: comparação entre sessões/participantes/condições no mesmo eixo.
- Dívida: eliminar `any` pré-existente sinalizado pelo lint.
