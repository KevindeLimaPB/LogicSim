# LogicSim

LogicSim e um simulador web de circuitos logicos digitais feito para estudo, experimentacao e apoio academico. A aplicacao permite montar circuitos com portas logicas, conectar componentes, alternar entradas, visualizar expressoes booleanas, gerar tabela verdade e acompanhar uma representacao de circuito de comutacao.

## Recursos

- Editor visual para montar circuitos logicos.
- Componentes: Input, Output, AND, OR, NOT, NAND, NOR, XOR e XNOR.
- Conexoes por fios entre pinos de entrada e saida.
- Inputs com switch ON/OFF para alternar entre 0 e 1.
- Calculo em tempo real da saida do circuito.
- Exibicao da expressao booleana.
- Copia da expressao booleana pelo toolbar.
- Zoom no editor.
- Modo de exclusao para remover portas e fios.
- Geracao de tabela verdade.
- Visualizacao do circuito de comutacao equivalente.
- Tema claro e escuro.
- Paginas auxiliares: Sobre e Saiba Mais.

## Tecnologias

- HTML5
- CSS3
- JavaScript modular
- SVG para portas, fios e elementos visuais
- Font Awesome para icones

## Estrutura do projeto

```text
.
|-- simulador.html          # Pagina principal do simulador
|-- sobre.html              # Pagina sobre o projeto
|-- saibaMais.html          # Pagina com conteudo educativo
|-- css/
|   |-- style.css           # Arquivo agregador dos estilos
|   |-- editor/             # Estilos do editor visual
|   |-- simulador/          # Estilos da pagina do simulador
|   |-- sobre/              # Estilos da pagina sobre
|   |-- saibaMais/          # Estilos da pagina saiba mais
|   `-- theme-material.css  # Ajustes de tema claro/escuro
|-- js/
|   |-- editor/             # Logica do editor e simulacao
|   |-- electrical/         # Conversao/renderizacao do circuito eletrico
|   |-- config/             # Scripts de configuracao de interface
|   `-- animacao/           # Scripts de animacao
`-- img/                    # Assets, SVGs e imagens do projeto
```

## Como usar

1. Abra `simulador.html`.
2. Use o toolbar para adicionar entradas, saidas e portas logicas.
3. Conecte o pino de saida de um componente ao pino de entrada de outro.
4. Alterne os Inputs pelo switch ON/OFF.
5. Veja a expressao booleana atualizada automaticamente.
6. Abra a aba de Tabela Verdade para gerar as combinacoes.
7. Abra a aba Circuito de Comutacao para visualizar a conversao eletrica.

## Objetivo academico

O LogicSim foi desenvolvido como projeto universitario para facilitar o aprendizado de logica digital, portas logicas, expressoes booleanas e circuitos combinacionais.
