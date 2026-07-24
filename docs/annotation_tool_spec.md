# Especificação Técnica: Ferramenta de Anotação Manual

Este documento mapeia os componentes e a arquitetura necessários para a construção do **Player de Anotação Avançada (Frame-by-Frame)**, que será construído em sprints futuras.

## 1. Objetivo
Permitir que pesquisadores ou anotadores contratados visualizem os vídeos extraídos e criem, revisem ou excluam eventos de microações associados a intervalos temporais específicos. As anotações servirão de *ground truth* para treinar ou auditar o modelo de Machine Learning.

## 2. Requisitos Principais

### Visuais e UX
- **Reprodutor de Vídeo Avançado**: Deve permitir pular frame a frame (ex: `<` e `>`).
- **Controle de Velocidade (Playback Rate)**: Modificadores rápidos (0.25x, 0.5x, 1x, 2x).
- **Timeline de Trilhas (Tracks)**: Visualização de intervalos anotados em formato de blocos coloridos (estilo editor de vídeo como Premiere ou ferramentas de áudio).
- **Formulário de Entrada Rápida**: Ferramenta ativada por atalhos de teclado para inserção veloz.

### Funcionais (Teclado)
- `Space`: Tocar / Pausar
- `Seta Esquerda / Direita`: Voltar 1 frame / Avançar 1 frame
- `Teclas Numéricas (1, 2, 3...)`: Iniciar a marcação de uma categoria (ex: 1 = Olho Fechado).
- `Enter`: Encerrar marcação (intervalo) e salvar.
- `Esc`: Cancelar marcação ativa.

## 3. Estrutura de Componentes Necessária (Frontend)

Estes componentes comporão a tela `AnnotationPage.tsx`:

1. `VideoAnnotatorPlayer`: O container principal do vídeo (HTML5 Video Element customizado com controle fino de frame rate).
2. `AnnotationTimeline`: Área inferior que reage à duração do vídeo e renderiza as `Tracks`.
3. `AnnotationTrack`: Linha individual de microação (ex: "Olhando para o lado"), onde caixas representam o `[start_time, end_time]`.
4. `AnnotationToolbar`: Barra de controles com botões correspondentes aos atalhos de teclado e dropdowns para classes de anotação.
5. `AnnotationSidebarList`: Lista em tabela exibindo todas as anotações do vídeo ordenadas por tempo, com botões para excluir ou saltar o vídeo para o momento da anotação.

## 4. Estrutura de Dados (Interfaces TypeScript)

```typescript
// src/types/annotation.ts
export interface AnnotationEvent {
  id: string;
  videoId: string;
  microActionType: string;
  startTime: number;
  endTime: number;
  startFrame: number;
  endFrame: number;
  confidence: number | null; // null for manual annotation, 0-1 for predictions
  annotatorId: string;
  notes?: string;
  createdAt: string;
}

export interface AnnotationTrackData {
  microActionType: string;
  events: AnnotationEvent[];
}
```

## 5. Endpoints Relacionados (Backend)
Esses endpoints suportarão a interface:
- `GET /api/v1/videos/{video_id}/annotations` -> Retorna as anotações existentes.
- `POST /api/v1/videos/{video_id}/annotations` -> Cria uma nova anotação.
- `PUT /api/v1/videos/{video_id}/annotations/{annotation_id}` -> Atualiza os limites de tempo de uma anotação.
- `DELETE /api/v1/videos/{video_id}/annotations/{annotation_id}` -> Remove uma anotação.
