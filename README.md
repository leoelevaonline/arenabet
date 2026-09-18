# ArenaBet

Aplicação React/Vite de jogos com apostas em créditos virtuais.

O projeto funciona de forma standalone. Contas, saldo, partidas, transações e configurações são persistidos no `localStorage` do navegador. A sessão fica no `sessionStorage`, então duas contas podem jogar em abas diferentes do mesmo navegador.

## Requisitos

- Node.js 20 ou superior
- npm

## Instalação

```bash
npm install
```

## Executar localmente

```bash
npm run dev
```

Abra o endereço exibido pelo Vite, normalmente `http://localhost:5173`.

## Cadastro e acesso

O cadastro exige nome completo, e-mail, CPF, telefone, data de nascimento e senha. Só entram maiores de 18 anos. Carteira e caixa aparecem somente com a conta logada.

Novas contas começam com 1.000 créditos virtuais.

## Jogos ativos

- `Dama`: partidas contra o Bot ArenaBet ou adversário online, com captura obrigatória e promoção a dama.
- `Sinuca`: mesa 2D com atrito, colisões, caçapas e turnos alternados.
- `Bocha`: bolim, quatro bolas por lado, alternância de quem está mais distante e pontuação por proximidade.
- `Futebol de mesa`: jogo autoral de flick soccer com discos, colisões, gols e IA ou segundo jogador.

Em cada mesa dá para escolher **Bot ArenaBet** ou **adversário online** (fila, mesa aberta ou dois jogadores no mesmo aparelho).

As referências de bocha foram consultadas na [Wikipédia em português](https://pt.wikipedia.org/wiki/Bocha) e na [Wikipédia em inglês](https://en.wikipedia.org/wiki/Bocce), incluindo bolim, cancha, bolas por equipe e pontuação por proximidade. A referência de mecânica do futebol de mesa foi a descrição pública do [Soccer Stars no Google Play](https://play.google.com/store/apps/details?id=com.miniclip.soccerstars): flick, física da bola, partidas por turnos e gols. Os gráficos do ArenaBet são autorais e não reutilizam assets dessas páginas.

## Persistência local

Os dados ficam armazenados somente no navegador atual. Para reiniciar completamente a aplicação, limpe os dados do site no navegador ou remova estas chaves:

- `arenabet.local.database.v1`
- `arenabet.session.v1`
- `arenabet.rooms.v1`
- `arenabet.presence.v1`

Esse modo é adequado para desenvolvimento e demonstração. Para uso real com múltiplos dispositivos, pagamentos ou dados compartilhados, substitua `src/api/localDatabase.js` por uma API segura com banco de dados no servidor.

## Comandos

```bash
npm run dev
npm run build
npm run preview
npm run lint
npm run typecheck
npm test
npm run test:browser
```

## Testes dos jogos

`npm test` verifica empates e manilhas do Truco, coordenadas da mesa vertical e o agendamento de quadros com fallback.

`npm run test:browser` abre um servidor isolado na porta 5185 e usa Playwright com Microsoft Edge. Os testes criam contextos de navegador próprios, sem alterar o saldo salvo no seu navegador. Para outro navegador Chromium instalado, configure `PLAYWRIGHT_CHANNEL`.

A suíte verifica gestos em 1440 × 1000 e 390 × 844, cancelamento de arrasto, interferência de outro ponteiro, abandono, apostas simultâneas e liquidação repetida. Três cenários de sinuca posicionam as bolas para testar a bola 8 legal, antecipada e na quebra, executando a tacada, colisão e liquidação aplicáveis. As capturas ficam em `test-results/`.

## Mesas e controles

- Sinuca e bocha giram a mesa no celular para ampliar bolas e alvos. O arrasto usa as mesmas coordenadas da física nas duas orientações.
- O bolim pode ser posicionado com toque na zona válida ou arrasto. O vencedor da mão abre a próxima na cabeceira oposta.
- Feltro, terra e grama usam texturas procedurais determinísticas, calculadas no fundo em cache. O campo de futebol é renderizado em resolução dupla.
- Futebol possui fallback de temporizador quando o navegador suspende quadros de animação.
- Truco mantém as cartas da última vaza visíveis até a próxima jogada e encerra a mão assim que as regras de empate definem o vencedor.

Os créditos são virtuais. Uma recarga não restaura a posição da mesa; uma partida interrompida pode ser encerrada pela Carteira.
