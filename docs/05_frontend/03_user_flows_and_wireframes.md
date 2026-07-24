# Fase 5 — Fluxos de Usuário e Wireframes Textuais

## 1. Fluxo pesquisador

```text
Login → Criar estudo → Cadastrar aula → Cadastrar participante → Registrar consentimento → Upload vídeo → Processar → Ver dashboard → Exportar dados
```

## 2. Fluxo anotador

```text
Login → Minhas tarefas → Abrir vídeo → Anotar eventos → Submeter → Corrigir conflitos se houver
```

## 3. Fluxo admin

```text
Login → Usuários → Estudos → Auditoria → Solicitações de exclusão → Modelos → Configurações
```

## 4. Tela: Dashboard de estudo

```text
[Nome do estudo] [Status] [Exportar]

KPIs:
- vídeos totais
- vídeos aceitos/degradados/rejeitados
- participantes
- jobs falhos
- modelo ativo

Gráficos:
- microações por aula
- qualidade dos vídeos
- ganho pré/pós-teste
- eventos por segmento temporal

Tabela:
participante | sessão | vídeo | qualidade | processamento | ações | relatório
```

## 5. Tela: Detalhe do vídeo

```text
Cabeçalho:
- participante pseudonimizado
- estudo
- duração/FPS/resolução
- quality badge
- model version

Abas:
1. Visão geral
2. Timeline
3. Landmarks
4. Anotações
5. Exportações
6. Auditoria
```

## 6. Tela: Timeline

```text
Vídeo à esquerda
Painel de métricas à direita
Timeline inferior com trilhas:
OF |====|      |==|
OC      |======|
ML   |=|
VR             |==|
```

Filtros:

- origem: modelo/humano/revisado;
- ação;
- confiança mínima;
- segmento temporal.

## 7. Tela: Anotação

Requisitos:

- player com frame index;
- zoom temporal;
- atalhos;
- trilhas por classe;
- botão submeter;
- alerta se houver frames sem classificação quando obrigatório.

## 8. Tela: Modelos

```text
model_version | stage | dataset | F1 OF | F1 OC | erro descriptor | criado em | ações
```

Ações:

- promover para staging;
- comparar modelos;
- baixar relatório;
- aposentar versão.

## 9. Tela: Consentimento

Mostrar:

- versão;
- finalidade;
- aceite;
- revogação;
- retenção;
- artefatos vinculados.

## 10. Critério de aceite

- [ ] pesquisador consegue processar vídeo sem suporte técnico;
- [ ] anotador consegue marcar evento em menos de 5 segundos;
- [ ] admin consegue localizar acesso a vídeo;
- [ ] usuário entende limitação científica do resultado.
