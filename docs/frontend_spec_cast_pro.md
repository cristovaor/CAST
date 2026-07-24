# Especificação Técnica — Frontend React

## 1. Objetivo do frontend

Construir uma interface profissional em React para substituir o protótipo atual em Streamlit, oferecendo experiência de produto para pesquisadores, analistas, professores e anotadores.

O frontend deve permitir:

- Gerenciar estudos, aulas, participantes e sessões.
- Fazer upload de vídeos com segurança.
- Acompanhar processamento em tempo real.
- Visualizar qualidade do vídeo.
- Visualizar microações ao longo do tempo.
- Comparar grupos, aulas e participantes.
- Anotar microações manualmente em frames/trechos.
- Exportar relatórios e datasets.

O foco inicial deve ser **clareza operacional**, não excesso de gráficos. Streamlit normalmente resolve exploração; React deve resolver fluxo de trabalho, governança e produto.

---

## 2. Stack recomendada

| Camada | Recomendação |
|---|---|
| Framework | React + TypeScript |
| Build | Vite ou Next.js |
| UI | shadcn/ui, Radix UI ou MUI |
| Estilo | Tailwind CSS ou CSS Modules |
| Estado servidor | TanStack Query |
| Estado local | Zustand ou Context API quando simples |
| Formulários | React Hook Form + Zod |
| Tabelas | TanStack Table |
| Gráficos | ECharts, Recharts ou Plotly.js |
| Upload | Uppy, tus-js-client ou implementação própria com URL pré-assinada |
| Testes | Vitest + React Testing Library + Playwright |
| Qualidade | ESLint, Prettier, TypeScript strict |

Decisão prática: **React + TypeScript + Vite + TanStack Query + Tailwind/shadcn** é suficiente para o MVP. Use Next.js apenas se houver necessidade forte de SSR, SEO público ou portal com páginas indexáveis.

---

## 3. Perfis de usuário

| Perfil | Permissões principais |
|---|---|
| Admin | gerencia organização, usuários, permissões e modelos |
| Researcher | cria estudos, aulas, participantes, sessões e relatórios |
| Annotator | visualiza vídeos/frames e cria anotações |
| Viewer | visualiza dashboards e relatórios |

---

## 4. Rotas principais

```text
/login
/app
/app/projects
/app/projects/:projectId
/app/studies/:studyId
/app/studies/:studyId/overview
/app/studies/:studyId/participants
/app/studies/:studyId/lessons
/app/studies/:studyId/sessions
/app/sessions/:sessionId
/app/videos/:videoId
/app/videos/:videoId/processing
/app/videos/:videoId/timeline
/app/videos/:videoId/annotations
/app/studies/:studyId/reports
/app/models
/app/settings
```

---

## 5. Estrutura de pastas

```text
frontend/
  src/
    app/
      routes.tsx
      providers.tsx
    pages/
      LoginPage.tsx
      DashboardPage.tsx
      ProjectsPage.tsx
      StudyOverviewPage.tsx
      ParticipantsPage.tsx
      SessionsPage.tsx
      VideoDetailPage.tsx
      ProcessingPage.tsx
      TimelinePage.tsx
      AnnotationPage.tsx
      ReportsPage.tsx
      ModelRegistryPage.tsx
      SettingsPage.tsx
    components/
      layout/
      navigation/
      forms/
      upload/
      charts/
      video/
      annotation/
      tables/
      status/
      permissions/
    features/
      auth/
      projects/
      studies/
      participants/
      sessions/
      videos/
      jobs/
      annotations/
      reports/
      models/
    lib/
      api.ts
      queryClient.ts
      auth.ts
      formatters.ts
      permissions.ts
      validators.ts
    types/
      api.ts
      domain.ts
    tests/
```

---

## 6. Experiência do usuário por fluxo

## 6.1. Login

### Tela

Campos:

- email;
- senha;
- botão entrar;
- recuperação de senha, se houver auth local.

### Regras

- Após login, redirecionar para `/app/projects`.
- Token deve ficar em storage seguro conforme estratégia do backend.
- Erros devem ser claros e não revelar se email existe.

---

## 6.2. Gestão de projeto e estudo

### Tela: lista de projetos

Componentes:

- cards de projetos;
- status: rascunho, ativo, concluído, arquivado;
- total de estudos;
- total de sessões;
- último processamento.

### Tela: visão do estudo

Indicadores:

- participantes cadastrados;
- vídeos enviados;
- vídeos processados;
- vídeos rejeitados por qualidade;
- microações detectadas;
- ganho médio de aprendizagem;
- distribuição por grupo, se aplicável.

Evite usar “carga cognitiva alta/baixa” como rótulo categórico no MVP. Use “indicadores de microações” e “correlações exploratórias”.

---

## 6.3. Cadastro de participante

Campos:

- código externo pseudonimizado;
- grupo experimental, se houver;
- metadados mínimos;
- status do consentimento;
- data de aceite;
- termo anexado ou versão do termo.

Regras:

- Não exigir nome civil no MVP.
- Não expor dados pessoais desnecessários no dashboard.
- Permitir revogação de consentimento.

---

## 6.4. Criação de sessão

Uma sessão representa a coleta de um participante assistindo uma aula/material.

Campos:

- participante;
- aula/material;
- grupo experimental;
- data da coleta;
- pré-teste;
- pós-teste;
- observações;
- vídeo.

A tela deve guiar o usuário em etapas:

```text
1. Participante
2. Aula/material
3. Pré-teste
4. Upload do vídeo
5. Pós-teste
6. Revisão e processamento
```

---

## 6.5. Upload de vídeo

### Requisitos

- Upload direto para storage via URL pré-assinada.
- Barra de progresso real.
- Retomada de upload, se possível.
- Validação prévia de tamanho e formato no client.
- Não bloquear a interface durante upload.

### Estados visuais

```text
idle
selecting_file
uploading
upload_complete
validating
queued
processing
processed
failed
rejected
```

### Componente

`VideoUploadCard`

Props:

```ts
type VideoUploadCardProps = {
  sessionId: string;
  maxSizeBytes: number;
  allowedMimeTypes: string[];
  onUploadCompleted: (videoId: string) => void;
};
```

---

## 6.6. Processamento em tempo real

### Tela: processamento do vídeo

Componentes:

- status geral;
- barra de progresso;
- etapa atual;
- logs resumidos;
- alertas de qualidade;
- botão cancelar;
- botão tentar novamente quando falhar.

### Etapas exibidas

```text
1. Extraindo metadados
2. Validando qualidade
3. Extraindo landmarks faciais
4. Gerando janelas temporais
5. Executando inferência
6. Sumarizando microações
7. Gerando relatório
```

### Integração

Preferir SSE no MVP:

```ts
const source = new EventSource(`/api/v1/jobs/${jobId}/stream`);
```

Usar polling com TanStack Query como fallback.

---

## 6.7. Tela de qualidade do vídeo

Indicadores:

- taxa de face detectada;
- FPS;
- resolução;
- duração;
- frames inválidos;
- quality_score;
- alertas: iluminação, oclusão, câmera instável, rosto fora do quadro.

Decisão de UX:

- Verde: apto;
- Amarelo: apto com ressalvas;
- Vermelho: rejeitado ou baixa confiabilidade.

Não esconder problemas de qualidade. Eles são centrais para interpretação científica.

---

## 6.8. Timeline de microações

### Objetivo

Permitir que o usuário veja quando cada microação ocorreu durante o vídeo.

### Componentes

- player de vídeo;
- timeline sincronizada;
- trilhas por microação;
- marcador de eventos;
- filtro por microação;
- zoom temporal;
- salto para evento;
- overlay opcional de landmarks.

### Microações MVP

- OLHO_FECHADO;
- OLHANDO_CANTO;
- MEXEU_LABIOS;
- VIROU_ROSTO.

### Layout sugerido

```text
[Video Player]
[Resumo do vídeo]
[Timeline]
  OLHO_FECHADO:  |---|     |-|   |----|
  OLHANDO_CANTO:     |--| |-----|       |--|
  MEXEU_LABIOS:          |-|        |-|
  VIROU_ROSTO:                  |--|
```

---

## 6.9. Anotação manual

### Objetivo

Criar base para validação, auditoria e re-treinamento dos classificadores.

### Tela

Componentes:

- player frame-a-frame;
- controle de velocidade;
- avançar/voltar 1 frame;
- seleção de intervalo;
- botões de microação;
- atalhos de teclado;
- lista de anotações;
- comparação anotação humana vs predição;
- exportação de anotações.

### Atalhos sugeridos

| Tecla | Ação |
|---|---|
| Espaço | play/pause |
| ← | frame anterior |
| → | próximo frame |
| 1 | olho fechado |
| 2 | olhando canto |
| 3 | mexeu lábios |
| 4 | virou rosto |
| Enter | salvar anotação |
| Esc | cancelar seleção |

### Contrato de anotação

```ts
type Annotation = {
  id: string;
  videoId: string;
  microAction: 'OLHO_FECHADO' | 'OLHANDO_CANTO' | 'MEXEU_LABIOS' | 'VIROU_ROSTO';
  startFrame: number;
  endFrame: number;
  startMs: number;
  endMs: number;
  confidence?: number;
  annotatorId: string;
  notes?: string;
};
```

---

## 6.10. Dashboard de estudo

### Indicadores mínimos

- Total de participantes.
- Total de vídeos.
- Vídeos processados.
- Vídeos rejeitados por qualidade.
- Média de ganho de aprendizagem.
- Microações por minuto.
- Distribuição por grupo R/NR ou outro desenho experimental.
- Correlação exploratória entre microações e ganho.

### Gráficos úteis

| Gráfico | Uso |
|---|---|
| Barras por microação | comparação entre vídeos/grupos |
| Boxplot | variação por grupo |
| Linha temporal | microações ao longo da aula |
| Scatter | microação vs ganho de aprendizagem |
| Heatmap | correlação entre variáveis |
| t-SNE/UMAP | exploração de agrupamentos |

### Regra crítica

Todo gráfico deve exibir:

- número de participantes;
- quantidade de vídeos válidos;
- modelo usado;
- versão do pipeline;
- alertas de qualidade.

Sem isso, o dashboard vira “gráfico bonito sem validade”.

---

## 7. Componentes principais

### 7.1. Layout

```text
AppShell
  Sidebar
  Topbar
  Breadcrumbs
  MainContent
```

### 7.2. Componentes de domínio

```text
ProjectCard
StudyStatusBadge
ParticipantTable
SessionWizard
VideoUploadCard
ProcessingStatusPanel
VideoQualityPanel
MicroActionSummaryCards
MicroActionTimeline
VideoPlayerWithMarkers
AnnotationToolbar
AnnotationList
LearningGainCard
CorrelationHeatmap
ReportExportButton
ModelVersionBadge
```

---

## 8. Tipos TypeScript mínimos

```ts
export type JobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'canceled';

export type MicroAction =
  | 'OLHO_FECHADO'
  | 'OLHANDO_CANTO'
  | 'MEXEU_LABIOS'
  | 'VIROU_ROSTO';

export type ProcessingJob = {
  id: string;
  videoAssetId: string;
  jobType: string;
  status: JobStatus;
  progress: number;
  currentStep?: string;
  errorMessage?: string | null;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
};

export type VideoQuality = {
  faceDetectionRate: number;
  qualityScore: number;
  fps: number;
  width: number;
  height: number;
  durationSeconds: number;
  invalidFrames: number;
  warnings: string[];
};

export type MicroActionSummary = Record<
  MicroAction,
  {
    count: number;
    perMinute: number;
    durationMs?: number;
  }
>;
```

---

## 9. Integração com API

### 9.1. Cliente HTTP

Criar `apiClient` único:

```ts
export const apiClient = {
  get: async <T>(url: string): Promise<T> => {},
  post: async <T, B = unknown>(url: string, body: B): Promise<T> => {},
  patch: async <T, B = unknown>(url: string, body: B): Promise<T> => {},
  delete: async <T>(url: string): Promise<T> => {},
};
```

### 9.2. Hooks de domínio

```text
useProjects()
useStudy(studyId)
useParticipants(studyId)
useSessions(studyId)
useVideo(videoId)
useVideoQuality(videoId)
useProcessingJob(jobId)
useVideoPredictions(videoId)
useStudyDashboard(studyId)
useAnnotations(videoId)
```

### 9.3. Tratamento de erro

Padronizar UI para:

- erro de autenticação;
- erro de permissão;
- erro de validação;
- erro de upload;
- erro de processamento;
- erro de vídeo rejeitado;
- erro de conexão.

---

## 10. Requisitos de UX

### 10.1. Clareza científica

A interface deve diferenciar:

- dado observado;
- dado previsto pelo modelo;
- métrica estatística;
- hipótese interpretativa.

Exemplo ruim:

> “Aluno teve alta carga cognitiva.”

Exemplo correto:

> “O vídeo apresentou aumento de OLHANDO_CANTO por minuto no terço final da aula. Interpretação exige validação com pré/pós-teste e qualidade do vídeo.”

### 10.2. Estados vazios

Cada tela deve explicar o próximo passo.

Exemplo:

```text
Nenhum vídeo processado ainda.
Envie um vídeo de sessão para iniciar a extração de microações.
```

### 10.3. Estados de baixa confiança

Quando quality_score for baixo:

- exibir alerta visível;
- degradar confiança do relatório;
- impedir comparação automática sem aviso.

---

## 11. Segurança e privacidade no frontend

- Não armazenar vídeo em localStorage/sessionStorage.
- Não expor URLs permanentes de vídeos.
- Usar URLs temporárias para preview.
- Ocultar dados pessoais por padrão.
- Exibir código pseudonimizado do participante.
- Confirmar ações destrutivas.
- Exibir status de consentimento.
- Bloquear acesso a anotação/vídeo conforme role.

---

## 12. Testes frontend

### 12.1. Unitários

- renderização de cards;
- formatadores de métricas;
- validação de formulários;
- cálculo visual de progresso;
- componentes de status.

### 12.2. Integração

- criação de estudo;
- cadastro de participante;
- fluxo de sessão;
- upload mockado;
- tela de processamento com eventos SSE mockados;
- visualização de timeline.

### 12.3. E2E

Cenários Playwright:

1. Login.
2. Criar projeto.
3. Criar estudo.
4. Cadastrar participante.
5. Criar sessão.
6. Subir vídeo.
7. Acompanhar processamento.
8. Abrir relatório.
9. Exportar CSV.

---

## 13. Backlog por sprint

### Sprint 0 — Fundação

- Criar projeto React + TypeScript.
- Configurar lint, format, testes.
- Criar AppShell.
- Criar login mockado ou integrado.
- Criar design tokens.
- Criar cliente API.

### Sprint 1 — Estudos e participantes

- Tela de projetos.
- Tela de estudo.
- CRUD de participantes.
- Tela de consentimento.
- Tabela de sessões.

### Sprint 2 — Sessão e upload

- Wizard de sessão.
- Formulário de pré/pós-teste.
- Upload com progresso.
- Estado de validação do vídeo.

### Sprint 3 — Processamento

- Tela de job.
- SSE/polling.
- Status por etapa.
- Erro, cancelamento e retry.

### Sprint 4 — Resultados

- Resumo de microações.
- Timeline sincronizada com vídeo.
- Painel de qualidade.
- Exportação.

### Sprint 5 — Anotação

- Player frame-a-frame.
- Toolbar de microações.
- Atalhos de teclado.
- Lista de anotações.
- Comparação anotação vs predição.

### Sprint 6 — Dashboard analítico

- Dashboard por estudo.
- Comparação de grupos.
- Boxplot/scatter/heatmap.
- Relatório final.

---

## 14. Definition of Done

O frontend está pronto para MVP quando:

- O pesquisador consegue criar estudo completo sem intervenção técnica.
- O upload de vídeo é confiável e transparente.
- O status de processamento é compreensível.
- Os alertas de qualidade são visíveis.
- O usuário consegue interpretar microações por vídeo e por grupo.
- O relatório deixa claro modelo, versão, amostra e limitações.
- O anotador consegue marcar microações com velocidade aceitável.
- As permissões impedem acesso indevido a vídeos e dados pessoais.

---

## 15. Pontos de decisão de produto

Antes de desenhar telas finais, responder:

1. O usuário primário é pesquisador, professor, gestor educacional ou aluno?
2. A interface será para uso interno ou SaaS multi-instituição?
3. O vídeo bruto ficará disponível para revisão ou será apagado após extração?
4. A anotação manual entra no MVP?
5. O dashboard deve priorizar aluno individual, aula, turma ou comparação de materiais?
6. A aplicação precisa ser white-label para instituições?
7. O relatório final será acadêmico, operacional ou comercial?

A resposta define navegação, terminologia, permissões e visualizações.
