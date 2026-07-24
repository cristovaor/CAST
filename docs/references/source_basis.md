# Referências e Base Documental

## Documento científico base

COSTA, Cristóvão da Silva Rodrigues. **Detecção de microações em vídeos faciais para análise de carga cognitiva em ambientes de aprendizado multimídia**. Dissertação (Mestrado em Informática) — Universidade Federal de Alagoas, Maceió, 2023.

Elementos extraídos para especificação:

- uso de vídeos faciais de estudantes em aulas multimídia;
- FaceMesh/MediaPipe para pontos faciais;
- uso de subconjunto de 100 pontos em regiões de olhos, íris, sobrancelhas, boca e contorno;
- descarte da coordenada `z` no modelo original;
- normalização por região via bounding box;
- anotações frame-level para OF, OC, ML, VR e NEUTRO;
- janelas de 7 frames;
- classificadores binários LSTM por microação;
- arquitetura com TimeDistributed Dense + 3 LSTMs + Dense softmax;
- validação leave-one-video-out;
- colapso de previsões consecutivas para contagem de eventos;
- limitações por qualidade de vídeo, iluminação, oclusão e variabilidade interpessoal.

## Referências legais e regulatórias

- Lei Geral de Proteção de Dados Pessoais — Lei nº 13.709/2018, texto compilado: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/L13709compilado.htm
- ANPD — Relatório de Impacto à Proteção de Dados Pessoais: https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/relatorio-de-impacto-a-protecao-de-dados-pessoais-ripd
- ANPD — discussões sobre dados biométricos: https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-abre-tomada-de-subsidios-sobre-tratamento-de-dados-biometricos

## Referências técnicas

- MediaPipe FaceMesh documentation.
- FastAPI documentation.
- React documentation.
- PostgreSQL documentation.
- OpenAPI Specification.
- MLflow documentation, se adotado no futuro.
