# Fase 0 — Project Charter

## 1. Nome

CAST Pro — Cognitive Analysis System.

## 2. Problema

Ambientes de aprendizagem multimídia produzem grande volume de vídeo, mas a avaliação de atenção, esforço cognitivo e adequação do material ainda depende de métodos manuais, questionários ou inferências subjetivas. O CAST Pro busca operacionalizar a análise de microações faciais como sinal complementar para pesquisa educacional e melhoria de materiais didáticos.

## 3. Proposta de valor

Plataforma para:

- coletar vídeos faciais de estudantes durante sessões de aprendizagem;
- extrair landmarks faciais com MediaPipe FaceMesh;
- detectar microações faciais com classificadores ML;
- gerar descritores de vídeo;
- correlacionar microações com pré/pós-teste e tipo de material;
- apoiar pesquisadores, professores e designers instrucionais.

## 4. Escopo do MVP

Incluído:

- autenticação de usuários;
- criação de estudos, aulas, participantes e sessões;
- upload de vídeo;
- validação automática de qualidade do vídeo;
- processamento assíncrono;
- extração de landmarks;
- inferência de microações;
- timeline visual;
- anotação manual;
- exportação CSV/Parquet;
- relatório por sessão;
- controle de consentimento.

Excluído do MVP:

- detecção em tempo real;
- diagnóstico clínico, psicológico ou neurocognitivo;
- reconhecimento de identidade;
- decisão automatizada sobre aluno;
- integração LMS completa;
- modelos generativos explicativos.

## 5. Personas

| Persona | Necessidade | Tela crítica |
|---|---|---|
| Pesquisador | validar hipótese e exportar dados | Estudos, datasets, exportação |
| Professor | entender pontos de maior esforço | Dashboard de aula |
| Anotador | marcar microações com precisão | Ferramenta de anotação |
| Admin | governança, usuários e auditoria | Admin, consentimentos, logs |
| Engenheiro ML | treinar e comparar modelos | Model registry e avaliação |

## 6. Métricas de sucesso do MVP

| Métrica | Meta inicial |
|---|---:|
| Vídeos aceitos sem intervenção | >= 80% dos vídeos padronizados |
| Face detected rate médio | >= 90% |
| Tempo processamento para vídeo de 3 min | <= 5 min em CPU; <= 90s em GPU |
| Concordância entre anotadores | Kappa >= 0.70 por microação |
| Exportação reproduzível | 100% com dataset_version/model_version |
| Taxa de falha de job | < 5% |

## 7. Premissas

- O usuário tem consentimento dos participantes.
- O vídeo facial é capturado em condições controladas.
- A análise é usada como suporte, não como decisão automatizada.
- A primeira versão roda offline/batch.
- O backend Python é responsável por ML e processamento.
- O frontend React substitui Streamlit apenas na camada de produto.

## 8. Riscos de negócio

| Risco | Impacto | Mitigação |
|---|---|---|
| Prometer carga cognitiva sem validação | Alto | posicionamento conservador |
| Dataset pequeno | Alto | fase de expansão de coleta |
| Anotação inconsistente | Alto | protocolo + dupla anotação |
| LGPD mal tratada | Alto | consentimento, retenção e auditoria |
| Métrica enganosa | Médio | separar frame/event/descriptor/educational |
