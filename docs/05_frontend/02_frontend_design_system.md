# Fase 5 — Design System Frontend

## 1. Objetivo

Criar um frontend React profissional, consistente e seguro para interpretação de resultados científicos.

## 2. Stack recomendada

- React + TypeScript.
- Vite ou Next.js.
- TanStack Query para dados assíncronos.
- Zustand ou Redux Toolkit para estado local complexo.
- React Hook Form + Zod.
- Tailwind ou design system próprio.
- shadcn/ui opcional.
- Recharts/ECharts para gráficos.
- Video.js ou player customizado para anotação.

## 3. Princípios de UI

- Mostrar estado de qualidade do vídeo antes de resultado do modelo.
- Sempre exibir versão do modelo.
- Separar claramente predição de anotação humana.
- Usar avisos de incerteza.
- Evitar linguagem diagnóstica.
- Tornar exportação e auditoria visíveis para admin.

## 4. Tokens

```text
spacing: 4, 8, 12, 16, 24, 32
radius: 4, 8, 12
font: Inter ou system-ui
status colors: success, warning, danger, info
```

## 5. Estados globais

| Estado | Exibição |
|---|---|
| loading | skeleton + descrição da etapa |
| empty | orientação de próximo passo |
| error | mensagem clara + retry |
| degraded | aviso de qualidade |
| processing | barra de progresso + etapa |
| completed | resultados + versão |

## 6. Componentes base

- `AppShell`
- `SidebarNavigation`
- `StudyCard`
- `VideoUploadDropzone`
- `QualityBadge`
- `JobProgressPanel`
- `TimelineViewer`
- `MicroActionTrack`
- `AnnotationEventEditor`
- `ModelVersionBadge`
- `ConsentStatusBadge`
- `ExportButton`

## 7. Badges de status

```text
ACCEPTED: vídeo adequado
DEGRADED: resultado com cautela
REJECTED: não processar sem override
MODEL: predição do modelo
HUMAN: anotação humana
REVIEWED: anotação revisada
```

## 8. Textos de cautela

Relatório e dashboard devem exibir:

> Indicadores exploratórios. Não representam diagnóstico individual nem avaliação definitiva de carga cognitiva.

## 9. Acessibilidade

- Navegação por teclado na anotação.
- Contraste mínimo AA.
- Tooltips explicativos.
- Não depender apenas de cor.
- Suporte a legendas/descrições quando houver material de aula.

## 10. Critério de aceite

- [ ] telas principais responsivas;
- [ ] timeline fluida em vídeo de 3 min;
- [ ] atalhos da anotação funcionando;
- [ ] erros de API tratados;
- [ ] estado de job em tempo real;
- [ ] avisos de incerteza visíveis.
