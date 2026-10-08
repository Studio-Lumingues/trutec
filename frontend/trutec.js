// ============================================================================
// TRUTEC — truco roguelike solo, estilo Balatro
// - 4 Antes, cada um com 3 blinds (Pequena, Grande, Chefe). Cada blind tem uma
//   META DE PONTOS e um número limitado de MÃOS de truco contra um rival.
// - Mão ganha = FICHAS x MULT. O valor do truco (1/3/6/9/12) é o seu MULT:
//   pedir TRUCO, SEIS, NOVE e DOZE multiplica a pontuação... e o risco.
// - CURINGAS (até 5) dão fichas, mult e dinheiro. Dinheiro vai pra LOJA.
// - TROCAS = descartes: troque cartas antes de jogar a primeira da mão.
// - Chefes mudam as regras. Sem vidas: não bateu a meta nas mãos, acabou.
// Arquivo independente: cria #screen-trutec e usa o botão #btn-open-trutec.
// Ajuste a dificuldade nas constantes logo abaixo.
// ============================================================================
(function () {
  'use strict';

  // ---------- constantes de balanceamento ----------
  var ANTES = 4, HANDS = 4, TROCAS = 3, JSLOTS = 5, CHIPS0 = 30, START_MONEY = 4;
  var BASE = [90, 250, 600, 1400];          // meta base de cada Ante
  var BMULT = [1, 1.5, 2];                   // pequena, grande, chefe
  var BREWARD = [3, 4, 5];                   // dinheiro por blind
  var BEST_KEY = 'trutec-roguelike-best';

  // ---------- baralho ----------
  var RANKS = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];
  var SUITS = ['ouros', 'espadas', 'copas', 'paus'];
  var SYM = { ouros: '♦', espadas: '♠', copas: '♥', paus: '♣' };
  var COLOR = { ouros: 'red', espadas: 'black', copas: 'red', paus: 'black' };
  var STAKES = [1, 3, 6, 9, 12];
  var CALLS = ['', 'TRUCO', 'SEIS', 'NOVE', 'DOZE'];
  var CHIPV = { '4': 4, '5': 5, '6': 6, '7': 7, 'Q': 10, 'J': 10, 'K': 10, 'A': 11, '2': 12, '3': 13 };

  // ---------- ÍCONES DESENHADOS (no lugar dos emojis) ----------
  // Cada curinga/rival/chefe tem um desenho próprio (cores + contorno escuro), igual ao estilo "hand drawn" do resto do jogo.
  // O tremido vem do filtro #boil-ic (CSS .tt-ic). Uso: ic('gato') devolve o <svg> pronto; ic('olho', 'tt-ic-inline') pra ficar do tamanho do texto.
  var IC_SPRITE = '<symbol id="tt-ic-zap" viewBox="0 0 24 24"><g fill="none" stroke="#1a1209" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><circle cx="12" cy="8.2" r="3.9" fill="#26231f"/><circle cx="7" cy="13.4" r="3.9" fill="#26231f"/><circle cx="17" cy="13.4" r="3.9" fill="#26231f"/><path d="M12 12.5 L10.2 21 L13.9 21 Z" fill="#26231f"/><path d="M9.3 6.8 C9.8 5.8 10.8 5.4 11.8 5.5 M4.8 12 C5.2 11.2 5.9 10.8 6.6 10.8" stroke="#fff8f0" stroke-width="1"/><path d="M19 1.5 L15.2 7.8 L18 7.8 L16.4 12.6 L21.8 5.9 L18.9 5.9 L20.6 1.5 Z" fill="#ffd23f"/></g></symbol><symbol id="tt-ic-manilheiro" viewBox="0 0 24 24"><g fill="none" stroke="#1a1209" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><path d="M12 2.6 L14.8 8.8 L21.4 9.4 L16.4 13.8 L17.9 20.4 L12 17 L6.1 20.4 L7.6 13.8 L2.6 9.4 L9.2 8.8 Z" fill="#ffd23f"/><path d="M9.6 9.8 L12 5.6" stroke="#fff8f0" stroke-width="1.1"/></g></symbol><symbol id="tt-ic-tres" viewBox="0 0 24 24"><g fill="none" stroke="#1a1209" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><rect x="4.8" y="2.6" width="14.4" height="18.8" rx="2" fill="#fff8f0"/><path d="M8.6 6.8 C11 4.6 15.2 5.8 14.9 8.7 C14.7 10.6 12.7 11.4 11.2 11.6 C13.8 11.6 15.8 13 15.5 15.6 C15.1 18.6 10.6 19.6 8.2 17.4" stroke="#1f6fd1" stroke-width="2.3"/></g></symbol><symbol id="tt-ic-sete" viewBox="0 0 24 24"><g fill="none" stroke="#1a1209" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><rect x="4.8" y="2.6" width="14.4" height="18.8" rx="2" fill="#fff8f0"/><path d="M8 6.4 L16.2 6.2 L11.4 19 M9.6 12.8 L14.2 12.7" stroke="#d1302a" stroke-width="2.3"/></g></symbol><symbol id="tt-ic-caradepau" viewBox="0 0 24 24"><g fill="none" stroke="#1a1209" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><path d="M12 2.8 C17.4 2.6 21.4 6.8 21.2 12.2 C21 17.6 17 21.4 12 21.2 C6.8 21.4 2.8 17.4 2.8 12 C2.7 6.8 6.8 2.7 12 2.8 Z" fill="#ffd23f"/><path d="M6.8 9.2 L10.2 9.4 M13.8 9.4 L17.2 9.2 M8.4 11.6 h.01 M15.6 11.6 h.01 M7.6 16.4 L16.4 16.2" stroke-width="1.7"/></g></symbol><symbol id="tt-ic-ousadia" viewBox="0 0 24 24"><g fill="none" stroke="#1a1209" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><path d="M12.4 2.4 C13 6.2 16.8 8.2 17.8 12.4 C18.8 16.6 16.2 21 12 21.2 C7.6 21.4 5 17.8 5.8 13.8 C6.2 11.8 7.4 10.4 8.5 9.2 C8.7 10.9 9.5 11.9 10.6 12.4 C10.3 8.4 10.7 5.2 12.4 2.4 Z" fill="#ff7a3d"/><path d="M12 20.4 C10.3 19.8 9.9 18 10.7 16.6 C11.3 15.6 12.1 15 12.4 14 C13.9 15.2 14.7 16.5 14.5 18 C14.3 19.3 13.2 20.2 12 20.4 Z" fill="#ffd23f" stroke-width="1.1"/></g></symbol><symbol id="tt-ic-virada" viewBox="0 0 24 24"><g fill="none" stroke="#1a1209" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><g stroke="#1a1209" stroke-width="4.4"><path d="M5 11.4 C5 7.4 9 4.6 13 5.4 C15.5 5.8 17.4 7.2 18.4 9 M18.6 4.2 L18.7 9.6 L13.8 9.5"/><path d="M19 12.8 C19 16.8 15 19.6 11 18.8 C8.5 18.4 6.6 17 5.6 15.2 M5.4 19.8 L5.3 14.4 L10.2 14.5"/></g><g stroke="#3fae5a" stroke-width="2.2"><path d="M5 11.4 C5 7.4 9 4.6 13 5.4 C15.5 5.8 17.4 7.2 18.4 9 M18.6 4.2 L18.7 9.6 L13.8 9.5"/><path d="M19 12.8 C19 16.8 15 19.6 11 18.8 C8.5 18.4 6.6 17 5.6 15.2 M5.4 19.8 L5.3 14.4 L10.2 14.5"/></g></g></symbol><symbol id="tt-ic-limpa" viewBox="0 0 24 24"><g fill="none" stroke="#1a1209" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><path d="M20.4 2.8 L12.2 12.6" stroke="#8a5a2b" stroke-width="2.4"/><path d="M20.4 2.8 L12.2 12.6" stroke="#1a1209" stroke-width=".7" opacity=".5"/><path d="M9.3 11 L15 14.4 L12.6 21 C9.6 21.6 6.4 20.6 4.4 19 C6.4 16.6 8 14 9.3 11 Z" fill="#e8b84a"/><path d="M9.3 11 L15 14.4 M7.6 16.2 L9.6 19.8 M10.4 14.6 L12 19.6" stroke-width="1"/></g></symbol><symbol id="tt-ic-poupador" viewBox="0 0 24 24"><g fill="none" stroke="#1a1209" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><path d="M13.8 7.4 L15.4 3.8 L17.4 8.4 Z" fill="#ff8aa5"/><ellipse cx="11.6" cy="12.8" rx="8" ry="6.2" fill="#ff9bb5"/><ellipse cx="20" cy="13.4" rx="2" ry="2.7" fill="#ff7a96"/><path d="M7.4 17.6 L7.2 21 L9.6 21 L9.8 18.6 M13.8 18.4 L14 21 L16.4 21 L16.2 17.4" fill="#ff9bb5"/><path d="M8.4 7.6 L12.6 7.4 M3.6 11 C1.8 10 1.8 8.2 3.4 8" /><path d="M16.8 11.2 h.01" stroke-width="2"/></g></symbol><symbol id="tt-ic-maocheia" viewBox="0 0 24 24"><g fill="none" stroke="#1a1209" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><g transform="rotate(-26 12 22)"><rect x="7.4" y="4.6" width="9.2" height="14" rx="1.6" fill="#fff8f0"/><path d="M12 9.6 L13.6 12 L12 14.4 L10.4 12 Z" fill="#d1302a" stroke-width="1"/></g><g transform="rotate(26 12 22)"><rect x="7.4" y="4.6" width="9.2" height="14" rx="1.6" fill="#fff8f0"/><circle cx="12" cy="12" r="1.9" fill="#1a1209" stroke-width="1"/></g><g><rect x="7.4" y="3.4" width="9.2" height="14.6" rx="1.6" fill="#fff8f0"/><path d="M12 11.4 C10 9.2 8.6 10.4 9.2 12 C9.6 13.4 11.2 14.4 12 15.2 C12.8 14.4 14.4 13.4 14.8 12 C15.4 10.4 14 9.2 12 11.4 Z" fill="#d1302a" stroke-width="1"/></g></g></symbol><symbol id="tt-ic-maoextra" viewBox="0 0 24 24"><g fill="none" stroke="#1a1209" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><path d="M7.2 21.2 C5 18.4 4.4 15.4 5 12.8 L5.4 9.4 C5.5 8.2 7.2 8.2 7.2 9.4 L7.4 12.2 L7.6 5.4 C7.6 4.2 9.4 4.2 9.4 5.4 L9.6 11.2 L10 3.8 C10 2.6 12 2.6 12 3.8 L12.1 11.2 L12.8 5.4 C12.9 4.2 14.7 4.4 14.6 5.6 L14.2 12.4 L16.4 9.8 C17.2 9 18.6 9.9 18 11 C16.8 13.8 16.7 15.8 15.7 18.4 C15 20.2 14.2 21.2 12.8 21.2 Z" fill="#f2c9a0"/><circle cx="18.4" cy="18.6" r="4.3" fill="#d1302a"/><path d="M18.4 16.4 L18.4 20.8 M16.2 18.6 L20.6 18.6" stroke="#fff8f0" stroke-width="1.7"/></g></symbol><symbol id="tt-ic-blefe" viewBox="0 0 24 24"><g fill="none" stroke="#1a1209" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><g transform="translate(8.2 -2.4) scale(.8)"><path d="M4 6.5 C7 5 12 5 15 6.5 C15.5 12 14 17.5 9.5 19 C5 17.5 3.5 12 4 6.5 Z" fill="#4ba3d9"/><path d="M6 10 C7 9 8.4 9.2 9 10.2 C8 11 6.8 11 6 10 Z M10.5 10.2 C11.2 9.2 12.7 9 13.5 10 C12.8 11 11.4 11 10.5 10.2 Z" fill="#1a1209"/><path d="M6.8 16 C8.5 14 11.5 14 13 16" /></g><path d="M2.6 8.4 C6 6.8 11.4 6.8 14.6 8.4 C15.2 14.4 13.4 20 8.6 21.4 C3.8 20 2 14.4 2.6 8.4 Z" fill="#ffd23f"/><path d="M4.8 12 C5.8 10.8 7.2 11 7.8 12.2 C6.8 13 5.6 13 4.8 12 Z M9.4 12.2 C10.2 11 11.6 10.8 12.6 12 C11.8 13 10.4 13 9.4 12.2 Z" fill="#1a1209" stroke-width="1"/><path d="M5.4 16.4 C7.2 18.6 10.2 18.6 11.9 16.4"/></g></symbol><symbol id="tt-ic-banqueiro" viewBox="0 0 24 24"><g fill="none" stroke="#1a1209" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><path d="M2.8 9.6 L12 3.2 L21.2 9.6 Z" fill="#ffd23f"/><rect x="4.6" y="10.8" width="2.8" height="7.4" fill="#fff8f0"/><rect x="10.6" y="10.8" width="2.8" height="7.4" fill="#fff8f0"/><rect x="16.6" y="10.8" width="2.8" height="7.4" fill="#fff8f0"/><path d="M2.8 18.4 L21.2 18.3 L21 21.4 L3 21.5 Z" fill="#8a5a2b"/><circle cx="12" cy="7.2" r="1.3" fill="#fff8f0" stroke-width="1"/></g></symbol><symbol id="tt-ic-moedeiro" viewBox="0 0 24 24"><g fill="none" stroke="#1a1209" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><circle cx="12" cy="12" r="8.8" fill="#ffd23f"/><circle cx="12" cy="12" r="5.8" stroke="#b8860b" stroke-width="1"/><path d="M13.8 9.4 C13.2 8.2 10.2 8.2 10.2 10 C10.2 11.8 14 11.4 14 13.4 C14 15.4 11 15.4 10.2 14.2 M12 7.2 L12 16.8" stroke-width="1.5"/><path d="M6.4 8.4 C7 7.4 7.8 6.8 8.8 6.4" stroke="#fff8f0" stroke-width="1"/></g></symbol><symbol id="tt-ic-coelho" viewBox="0 0 24 24"><g fill="none" stroke="#1a1209" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><path d="M12.4 12.4 C12.8 16 14.4 19 17.4 21" stroke="#2c7a3f" stroke-width="1.8"/><path d="M12 11.6 C9.4 9.6 8.4 6 9.8 4.4 C10.9 3.3 12 4 12 5.4 C12 4 13.1 3.3 14.2 4.4 C15.6 6 14.6 9.6 12 11.6 Z" fill="#3fae5a"/><g transform="rotate(90 12 12)"><path d="M12 11.6 C9.4 9.6 8.4 6 9.8 4.4 C10.9 3.3 12 4 12 5.4 C12 4 13.1 3.3 14.2 4.4 C15.6 6 14.6 9.6 12 11.6 Z" fill="#3fae5a"/></g><g transform="rotate(180 12 12)"><path d="M12 11.6 C9.4 9.6 8.4 6 9.8 4.4 C10.9 3.3 12 4 12 5.4 C12 4 13.1 3.3 14.2 4.4 C15.6 6 14.6 9.6 12 11.6 Z" fill="#3fae5a"/></g><g transform="rotate(270 12 12)"><path d="M12 11.6 C9.4 9.6 8.4 6 9.8 4.4 C10.9 3.3 12 4 12 5.4 C12 4 13.1 3.3 14.2 4.4 C15.6 6 14.6 9.6 12 11.6 Z" fill="#3fae5a"/></g></g></symbol><symbol id="tt-ic-covarde" viewBox="0 0 24 24"><g fill="none" stroke="#1a1209" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><path d="M5.8 2.6 L5.9 21.4" stroke-width="2.2"/><path d="M6.4 4.4 C9.8 2.8 13 6.2 16.6 4.6 C18 4 19.4 4 20.4 4.4 L19.4 11.8 C16.2 13 13 10.2 9.8 11.8 L6.6 12.2 Z" fill="#fff8f0"/></g></symbol><symbol id="tt-ic-olho" viewBox="0 0 24 24"><g fill="none" stroke="#1a1209" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><path d="M2.4 12 C6 6.2 18 6.2 21.6 12 C18 17.8 6 17.8 2.4 12 Z" fill="#fff8f0"/><circle cx="12" cy="12" r="4" fill="#1f9bd1"/><circle cx="12" cy="12" r="1.8" fill="#1a1209" stroke-width="1"/><circle cx="13.3" cy="10.7" r=".9" fill="#fff8f0" stroke="none"/></g></symbol><symbol id="tt-ic-gato" viewBox="0 0 24 24"><g fill="none" stroke="#1a1209" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><path d="M4.8 10 L4.6 3.6 L9.6 6.6 C11.1 6.2 12.9 6.2 14.4 6.6 L19.4 3.6 L19.2 10 C20.2 12.2 20 15 17.8 17.4 C15.8 19.8 8.2 19.8 6.2 17.4 C4 15 3.8 12.2 4.8 10 Z" fill="#ff9b4a"/><path d="M10.6 8 L10.6 9.6 M12 7.6 L12 9.4 M13.4 8 L13.4 9.6" stroke="#b5561a" stroke-width="1.1"/><ellipse cx="8.8" cy="12.2" rx="1.9" ry="1.6" fill="#9be07a" stroke-width="1"/><ellipse cx="15.2" cy="12.2" rx="1.9" ry="1.6" fill="#9be07a" stroke-width="1"/><path d="M8.8 11.2 L8.8 13.2 M15.2 11.2 L15.2 13.2" stroke-width="1.1"/><path d="M11 14.4 L13 14.4 L12 15.6 Z" fill="#ff7a96" stroke-width="1"/><path d="M12 15.6 L12 16.6 M10.2 17.2 C11 17.6 11.7 17.2 12 16.6 C12.3 17.2 13 17.6 13.8 17.2" stroke-width="1"/><path d="M2.2 14 L6 14.6 M2.4 16.8 L6.2 15.8 M21.8 14 L18 14.6 M21.6 16.8 L17.8 15.8" stroke-width=".9"/></g></symbol><symbol id="tt-ic-baralho" viewBox="0 0 24 24"><g fill="none" stroke="#1a1209" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><rect x="7.4" y="1.8" width="13.6" height="18.6" rx="2" fill="#1f6fd1" transform="rotate(8 14 11)"/><rect x="4" y="2.8" width="13.8" height="18.6" rx="2" fill="#d1302a"/><rect x="6.2" y="5" width="9.4" height="14.2" rx="1" stroke="#fff8f0" stroke-width="1"/><path d="M10.9 8.4 L13.6 12.1 L10.9 15.8 L8.2 12.1 Z" fill="#fff8f0" stroke-width="1"/><path d="M14.4 18 L16.8 20.4 M16.8 18 L14.4 20.4" stroke="#ffd23f" stroke-width="1.5"/></g></symbol><symbol id="tt-ic-juros" viewBox="0 0 24 24"><g fill="none" stroke="#1a1209" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><rect x="4" y="15" width="4.2" height="6.4" fill="#3fae5a"/><rect x="9.9" y="12" width="4.2" height="9.4" fill="#3fae5a"/><rect x="15.8" y="9.4" width="4.2" height="12" fill="#3fae5a"/><path d="M3.6 10 L9 6.6 L12.6 8.6 L19.6 3.2 M15.8 3 L19.8 3.1 L19.5 7.2" stroke-width="1.7"/></g></symbol><symbol id="tt-ic-pao" viewBox="0 0 24 24"><g fill="none" stroke="#1a1209" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><g transform="rotate(-35 12 12)"><ellipse cx="12" cy="12" rx="10.2" ry="4.4" fill="#e8b86a"/><path d="M6.6 9.4 L8.6 14.2 M11 8.8 L13 15 M15.4 9.4 L17.2 14.2" stroke="#a8742a" stroke-width="1.3"/></g></g></symbol><symbol id="tt-ic-novelo" viewBox="0 0 24 24"><g fill="none" stroke="#1a1209" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><circle cx="11" cy="12" r="8.4" fill="#d1302a"/><path d="M4.4 9 C8 10.6 12.4 10 16.2 6.4 M3.6 13 C8.2 14.6 13.4 14 18.2 9.4 M5 17 C9.2 18.2 13.8 17.2 17.6 13.4" stroke="#7a1a16" stroke-width="1.1"/><path d="M16.8 18.4 C19.2 20.4 21 18.6 22.2 20.6" stroke="#d1302a" stroke-width="2"/></g></symbol><symbol id="tt-ic-vo" viewBox="0 0 24 24"><g fill="none" stroke="#1a1209" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><circle cx="12" cy="4.8" r="3" fill="#e9e9e9"/><ellipse cx="12" cy="13.6" rx="7.2" ry="7.8" fill="#f2c9a0"/><path d="M4.8 12.6 C4.4 6.8 19.6 6.8 19.2 12.6 C17.6 9.6 14.2 8.4 12 8.4 C9.8 8.4 6.4 9.6 4.8 12.6 Z" fill="#e9e9e9"/><circle cx="8.8" cy="13.6" r="2.3" fill="#fff8f0" fill-opacity=".5" stroke-width="1.2"/><circle cx="15.2" cy="13.6" r="2.3" fill="#fff8f0" fill-opacity=".5" stroke-width="1.2"/><path d="M11.1 13.4 L12.9 13.4 M8.8 13.6 h.01 M15.2 13.6 h.01 M9.4 18 C11 19.4 13 19.4 14.6 18" stroke-width="1.3"/><circle cx="6.9" cy="16.6" r="1" fill="#ff9bb5" stroke="none"/><circle cx="17.1" cy="16.6" r="1" fill="#ff9bb5" stroke="none"/></g></symbol><symbol id="tt-ic-cartola" viewBox="0 0 24 24"><g fill="none" stroke="#1a1209" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><ellipse cx="12" cy="18.2" rx="9.6" ry="2.8" fill="#26231f"/><path d="M6.4 18 L7.2 4.6 C9.6 3.6 14.4 3.6 16.8 4.6 L17.6 18 C14.6 19.4 9.4 19.4 6.4 18 Z" fill="#26231f"/><path d="M6.7 14.4 C10 15.8 14 15.8 17.3 14.4 L17.5 17.6 C14.4 19 9.6 19 6.5 17.6 Z" fill="#d1302a"/><path d="M8.4 6.4 L8.8 12" stroke="#fff8f0" stroke-width="1" opacity=".6"/></g></symbol><symbol id="tt-ic-cupcake" viewBox="0 0 24 24"><g fill="none" stroke="#1a1209" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><path d="M6 12.6 L18 12.6 L16.4 21 L7.6 21 Z" fill="#e0a06a"/><path d="M9.2 13 L9.8 20.6 M12 13 L12 20.8 M14.8 13 L14.2 20.6" stroke-width="1"/><path d="M4.8 13 C3.4 9.2 7 7.6 8 7.4 C8 4.8 10.4 3.8 12.4 4.8 C14.6 3.8 17 5.2 16.6 7.4 C19 8 20.6 10.6 19.2 13 Z" fill="#ff9bb5"/><circle cx="12.4" cy="3.4" r="1.8" fill="#d1302a"/></g></symbol><symbol id="tt-ic-peixe" viewBox="0 0 24 24"><g fill="none" stroke="#1a1209" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><path d="M17.4 13 L22 9.2 L22 16.8 Z" fill="#2f7fb8"/><ellipse cx="11" cy="13.4" rx="7.4" ry="4.6" fill="#4ba3d9"/><circle cx="7.4" cy="12.2" r="1.1" fill="#1a1209" stroke="none"/><path d="M11 9.2 C12.4 6.8 14.6 7 15.4 9.4 M9.6 14.4 C11 15.8 13 15.8 14.2 14.4" stroke-width="1"/><path d="M3.4 1.8 L3.4 9 C3.4 11.4 1.4 11.2 1.6 9.4" stroke-width="1.5"/></g></symbol><symbol id="tt-ic-velho" viewBox="0 0 24 24"><g fill="none" stroke="#1a1209" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><ellipse cx="12" cy="13.6" rx="7" ry="7.6" fill="#f2c9a0"/><path d="M4.8 11.6 C4.6 6.4 9.2 4.8 13 5 C17.6 5.2 19.6 7.6 19.2 11.6 L22.4 12.4 L4.4 12.2 Z" fill="#7a5a3a"/><path d="M8 12.6 L10.4 13.4 M14 13.4 L16.4 12.6 M9.4 14.8 h.01 M14.6 14.8 h.01" stroke-width="1.4"/><path d="M6.4 17 C8.2 14.8 11 15.4 12 16.6 C13 15.4 15.8 14.8 17.6 17 C16.4 19.4 13.8 18.8 12 18.4 C10.2 18.8 7.6 19.4 6.4 17 Z" fill="#f0f0f0"/></g></symbol><symbol id="tt-ic-estetoscopio" viewBox="0 0 24 24"><g fill="none" stroke="#1a1209" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><path d="M6 2.8 L6 9.6 C6 14.4 10.6 14.8 12 14.8 C13.4 14.8 18 14.4 18 9.6 L18 2.8" stroke="#1a1209" stroke-width="3.6"/><path d="M6 2.8 L6 9.6 C6 14.4 10.6 14.8 12 14.8 C13.4 14.8 18 14.4 18 9.6 L18 2.8" stroke="#4ba3d9" stroke-width="1.6"/><path d="M12 14.8 C12 19.2 14 20 16.2 19.4" stroke="#1a1209" stroke-width="3.6"/><path d="M12 14.8 C12 19.2 14 20 16.2 19.4" stroke="#4ba3d9" stroke-width="1.6"/><circle cx="6" cy="2.8" r="1.6" fill="#cfcfcf"/><circle cx="18" cy="2.8" r="1.6" fill="#cfcfcf"/><circle cx="18.6" cy="18" r="3.2" fill="#cfcfcf"/><circle cx="18.6" cy="18" r="1.3" fill="#8f8f8f" stroke-width="1"/></g></symbol><symbol id="tt-ic-cerveja" viewBox="0 0 24 24"><g fill="none" stroke="#1a1209" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><path d="M5 8 L5.4 19.8 C5.4 20.8 6 21.4 7 21.4 L13.4 21.4 C14.4 21.4 15 20.8 15 19.8 L15.4 8 Z" fill="#ffc23f"/><path d="M15.2 10.6 L18.4 10.6 C20 10.6 20.6 11.6 20.6 13 L20.6 15.2 C20.6 16.8 19.6 17.6 18 17.6 L15 17.6" stroke-width="2"/><circle cx="6.8" cy="6.8" r="2.4" fill="#fff8f0"/><circle cx="10.2" cy="5.6" r="2.9" fill="#fff8f0"/><circle cx="13.6" cy="6.8" r="2.4" fill="#fff8f0"/><path d="M8 12 L8 17 M11 13 L11 15.5 M13 11.5 L13 13" stroke="#fff8f0" stroke-width="1" opacity=".8"/></g></symbol><symbol id="tt-ic-curinga" viewBox="0 0 24 24"><g fill="none" stroke="#1a1209" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><path d="M3.8 15 C2.4 11 3.4 6.6 6 4.4 C6.6 8.6 8.6 11.6 11 13.2 Z" fill="#d1302a"/><path d="M8 13.4 C8.8 8.8 10.4 4.8 12 3 C13.6 4.8 15.2 8.8 16 13.4 Z" fill="#4ba3d9"/><path d="M13 13.2 C15.4 11.6 17.4 8.6 18 4.4 C20.6 6.6 21.6 11 20.2 15 Z" fill="#ffd23f"/><circle cx="6" cy="3.8" r="1.5" fill="#ffd23f"/><circle cx="12" cy="2.6" r="1.5" fill="#d1302a"/><circle cx="18" cy="3.8" r="1.5" fill="#4ba3d9"/><path d="M3.6 14.4 C8 17 16 17 20.4 14.4 L20.8 19 C16 21.6 8 21.6 3.2 19 Z" fill="#3fae5a"/><path d="M8 17.6 L9.2 19.4 L10.4 17.6 M13.6 17.8 L14.8 19.6 L16 17.8" stroke="#fff8f0" stroke-width="1"/></g></symbol><symbol id="tt-ic-oculos" viewBox="0 0 24 24"><g fill="none" stroke="#1a1209" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><path d="M2.4 8.6 L10.6 8.6 C11 12.4 9.8 15.6 6.8 15.6 C3.8 15.6 2.6 12.4 2.4 8.6 Z" fill="#26231f"/><path d="M13.4 8.6 L21.6 8.6 C21.4 12.4 20.2 15.6 17.2 15.6 C14.2 15.6 13 12.4 13.4 8.6 Z" fill="#26231f"/><path d="M10.6 9.8 C11.4 8.8 12.6 8.8 13.4 9.8 M2.4 8.6 L1.2 7.4 M21.6 8.6 L22.8 7.4" stroke-width="1.7"/><path d="M4.2 10 L5.6 12 M15.4 10 L16.8 12" stroke="#fff8f0" stroke-width="1" opacity=".7"/><path d="M12 16.6 L13.1 19 L15.6 19.2 L13.7 20.8 L14.4 23 L12 21.8 L9.6 23 L10.3 20.8 L8.4 19.2 L10.9 19 Z" fill="#ffd23f" stroke-width="1"/></g></symbol><symbol id="tt-ic-coroa" viewBox="0 0 24 24"><g fill="none" stroke="#1a1209" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><path d="M3 8 L7.4 12.6 L12 4.4 L16.6 12.6 L21 8 L19.6 19.4 L4.4 19.4 Z" fill="#ffd23f"/><path d="M4.6 16.4 C9 17.6 15 17.6 19.4 16.4" stroke-width="1.2"/><circle cx="3" cy="7.4" r="1.5" fill="#d1302a"/><circle cx="12" cy="3.8" r="1.5" fill="#4ba3d9"/><circle cx="21" cy="7.4" r="1.5" fill="#3fae5a"/><circle cx="12" cy="14.2" r="1.4" fill="#d1302a" stroke-width="1"/></g></symbol><symbol id="tt-ic-alerta" viewBox="0 0 24 24"><g fill="none" stroke="#1a1209" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><path d="M12 3 L22 20.6 L2 20.6 Z" fill="#ffd23f"/><path d="M12 9 L12 14.6 M12 17.2 h.01" stroke-width="2"/></g></symbol><symbol id="tt-ic-trofeu" viewBox="0 0 24 24"><g fill="none" stroke="#1a1209" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><path d="M7 3.6 L17 3.6 L16.6 10.6 C16.4 13.8 14.4 15.4 12 15.4 C9.6 15.4 7.6 13.8 7.4 10.6 Z" fill="#ffd23f"/><path d="M7 5.4 C4.2 5.2 3.4 6.4 3.8 8.2 C4.2 10.2 5.8 10.8 7.4 10.8 M17 5.4 C19.8 5.2 20.6 6.4 20.2 8.2 C19.8 10.2 18.2 10.8 16.6 10.8"/><path d="M12 15.6 L12 18.6 M7.8 21 L16.2 20.9 L15.4 18.4 L8.6 18.5 Z" fill="#8a5a2b"/><path d="M9.4 6 L9.6 10" stroke="#fff8f0" stroke-width="1.1"/></g></symbol>';
  function ic(key, cls) {
    return '<svg class="tt-ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#tt-ic-' + key + '"/></svg>';
  }
  (function mountIcons() {
    function go() {
      if (document.getElementById('tt-icons')) return;
      var d = document.createElement('div');
      d.id = 'tt-icons';
      d.setAttribute('aria-hidden', 'true');
      d.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
      d.innerHTML = '<svg width="0" height="0" focusable="false"><defs>' + IC_SPRITE + '</defs></svg>';
      document.body.appendChild(d);
    }
    if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
  })();

  // ---------- rivais e chefes ----------
  var SMALLOPP = [
    { name: 'Seu Zé da Padaria', icon: 'pao', bio: 'Joga no feeling.' },
    { name: 'Dona Cida',         icon: 'novelo', bio: 'Paciente e cuidadosa.' },
    { name: 'Vó Nena',           icon: 'vo', bio: 'Ninguém sabe o que ela tem.' },
    { name: 'Zé do Truco',       icon: 'cartola', bio: 'Lenda do bar.' }
  ];
  var BIGOPP = [
    { name: 'Tia Marta',     icon: 'cupcake', bio: 'Doce, mas competitiva.' },
    { name: 'Seu Jorge',     icon: 'peixe', bio: 'Pescador de blefes.' },
    { name: 'Seu Raimundo',  icon: 'velho', bio: 'Jogou truco antes de você nascer.' },
    { name: 'Dr. Almeida',   icon: 'estetoscopio', bio: 'Calcula tudo.' }
  ];
  var BOSSES = [
    { key: 'beto',       name: 'Tio Beto',         icon: 'cerveja', bio: 'Grita TRUCO por qualquer coisa.', effect: 'O rival pede truco o tempo todo.' },
    { key: 'marquinhos', name: 'Marquinhos Blefe', icon: 'curinga', bio: 'Mestre do blefe.',                 effect: 'Sem trocas nesta blind.' },
    { key: 'delegado',   name: 'Delegado Tavares', icon: 'oculos', bio: 'Não aceita desaforo.',            effect: 'O mult do truco vale só a metade.' },
    { key: 'coringa',    name: 'O Coringa',        icon: 'coroa', bio: 'O chefe final.',                   effect: 'Só 3 mãos e o rival é craque.' }
  ];

  // ---------- curingas ----------
  // calc(x) devolve { chips, mult, xmult, money } ou null. x = contexto da mão ganha.
  function isManilha(c) { return H && c.rank === H.mani; }
  var JOKERS = [
    { id: 'zap',       icon: 'zap', name: 'Zap!',          price: 6, desc: '+10 Mult se você jogou o Zap (manilha de paus).',
      calc: function (x) { return x.played.some(function (c) { return isManilha(c) && c.suit === 'paus'; }) ? { mult: 10 } : null; } },
    { id: 'manilheiro', icon: 'manilheiro', name: 'Manilheiro',   price: 5, desc: '+4 Mult por manilha que ganhou vaza.',
      calc: function (x) { var n = x.won.filter(isManilha).length; return n ? { mult: 4 * n } : null; } },
    { id: 'tres',      icon: 'tres', name: 'Três Amigo',    price: 4, desc: '+25 Fichas por Três que ganhou vaza.',
      calc: function (x) { var n = x.won.filter(function (c) { return c.rank === '3'; }).length; return n ? { chips: 25 * n } : null; } },
    { id: 'sete',      icon: 'sete', name: 'Sete Belo',     price: 4, desc: '+7 Mult se você jogou um Sete.',
      calc: function (x) { return x.played.some(function (c) { return c.rank === '7'; }) ? { mult: 7 } : null; } },
    { id: 'caradepau', icon: 'caradepau', name: 'Cara de Pau',   price: 6, desc: 'x1,5 Mult se você pediu truco (ou mais) e ganhou.',
      calc: function (x) { return x.called ? { xmult: 1.5 } : null; } },
    { id: 'ousadia',   icon: 'ousadia', name: 'Ousadia',       price: 5, desc: '+6 Mult se a mão valia SEIS ou mais.',
      calc: function (x) { return x.level >= 2 ? { mult: 6 } : null; } },
    { id: 'virada',    icon: 'virada', name: 'Virada',        price: 6, desc: 'x2 Mult se perdeu a 1ª vaza e ganhou a mão.',
      calc: function (x) { return x.results[0] === 'opp' ? { xmult: 2 } : null; } },
    { id: 'limpa',     icon: 'limpa', name: 'Limpa',         price: 5, desc: 'x1,5 Mult se ganhou por 2 a 0.',
      calc: function (x) { return x.results.length === 2 && x.results.every(function (r) { return r === 'me'; }) ? { xmult: 1.5 } : null; } },
    { id: 'poupador',  icon: 'poupador', name: 'Poupador',      price: 5, desc: '+1 Mult a cada $4 que você tem.',
      calc: function (x) { var n = Math.floor(x.money / 4); return n ? { mult: n } : null; } },
    { id: 'paciencia', icon: '⏳', name: 'Paciência',     price: 4, desc: '+25 Fichas por mão que ainda sobra.',
      calc: function (x) { return x.handsLeft > 0 ? { chips: 25 * x.handsLeft } : null; } },
    { id: 'maocheia',  icon: 'maocheia', name: 'Mão Cheia',     price: 4, desc: '+60 Fichas se jogou as 3 cartas.',
      calc: function (x) { return x.played.length === 3 ? { chips: 60 } : null; } },
    { id: 'blefe',     icon: 'blefe', name: 'Blefe',         price: 6, desc: 'x2,5 Mult quando o rival corre do seu pedido.',
      calc: function (x) { return x.how === 'oppRun' ? { xmult: 2.5 } : null; } },
    { id: 'banqueiro', icon: 'banqueiro', name: 'Banqueiro',     price: 5, desc: '+$2 sempre que ganhar uma mão.',
      calc: function () { return { money: 2 }; } },
    { id: 'moedeiro',  icon: 'moedeiro', name: 'Moedeiro',      price: 4, desc: '+$1 por vaza que você ganhou na mão.',
      calc: function (x) { return x.won.length ? { money: x.won.length } : null; } },
    { id: 'coelho',    icon: 'coelho', name: 'Pé de Coelho',  price: 6, desc: 'Empate (cangou) vale vaza sua. +15 Fichas.',
      calc: function () { return { chips: 15 }; } },
    { id: 'covarde',   icon: 'covarde', name: 'Covarde',       price: 4, desc: 'Fugir ainda marca 60 pontos.', onRun: true,
      calc: function () { return { chips: 60 }; } },
    { id: 'olho',      icon: 'olho', name: 'Olho de Vidro', price: 4, desc: 'Mostra quantas manilhas e treses o rival tem.' },
    { id: 'gato',      icon: 'gato', name: 'Gato de Sete',  price: 5, desc: '+1 troca em cada blind.' }
  ];
  var VOUCHERS = [
    { id: 'maoextra', icon: 'maoextra', name: 'Mão Extra',      price: 8, desc: '+1 mão em toda blind.' },
    { id: 'baralho',  icon: 'baralho',  name: 'Baralho Marcado', price: 6, desc: '+1 troca em toda blind.' },
    { id: 'juros',    icon: 'juros', name: 'Poupança',       price: 7, desc: 'Juros por $5 guardados vão até $10 (em vez de $5).' }
  ];
  function jk(id) { return JOKERS.filter(function (j) { return j.id === id; })[0]; }
  function vc(id) { return VOUCHERS.filter(function (v) { return v.id === id; })[0]; }

  // ---------- estado ----------
  var R = null, H = null, tok = 0, built = false, DEMO = false;
  var $ = function (id) { return document.getElementById(id); };
  function hasJ(id) { return !!R && R.jokers.indexOf(id) >= 0; }
  function hasV(id) { return !!R && R.vouchers.indexOf(id) >= 0; }
  function rnd(n) { return Math.floor(Math.random() * n); }
  function other(w) { return w === 'me' ? 'opp' : 'me'; }
  function later(fn, ms) { var t = tok; setTimeout(function () { if (t === tok) fn(); }, ms); }
  function best() { try { return parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { return 0; } }
  function saveBest(v) { if (DEMO) return; try { if (v > best()) localStorage.setItem(BEST_KEY, String(v)); } catch (e) {} }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = rnd(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  // sons de carta do truco convencional (audio.js): cardPlay = carta na mesa, cardDeal = carta distribuída/puxada
  function cardSfx(kind, delay, variation) { if (DEMO) return; try { var A = window.GameAudio; if (A && A[kind]) A[kind](delay || 0, variation || 0); } catch (e) {} }
  function sfx(kind) { if (DEMO) return; try { var A = window.GameAudio; if (!A) return; if (kind && A.playCall) A.playCall(kind); else if (A.click) A.click(); } catch (e) {} }

  function makeDeck() {
    var d = [];
    SUITS.forEach(function (s) { RANKS.forEach(function (r) { d.push({ rank: r, suit: s, id: r + s }); }); });
    return d;
  }
  function power(c) { return c.rank === H.mani ? 100 + SUITS.indexOf(c.suit) : RANKS.indexOf(c.rank); }
  function cardChips(c) { return isManilha(c) ? 30 + SUITS.indexOf(c.suit) * 10 : CHIPV[c.rank]; }
  function stakeMult(level) {
    var m = STAKES[level];
    if (R && R.blind && R.blind.boss === 'delegado') m = Math.max(1, Math.ceil(m / 2));
    return m;
  }

  function handWinner(res) {
    if (res.length < 2) return null;
    var a = res[0], b = res[1], c = res[2];
    if (a !== 'tie') {
      if (b === a || b === 'tie') return a;
      if (res.length < 3) return null;
      return c === 'tie' ? a : c;
    }
    if (b !== 'tie') return b;
    if (res.length < 3) return null;
    return c === 'tie' ? 'draw' : c;
  }

  // ============================================================================
  // INTERFACE
  // ============================================================================
  function build() {
    if (built) return;
    built = true;
    var lobby = $('screen-lobby');
    var host = lobby ? lobby.parentNode : document.body;
    var s = document.createElement('div');
    s.id = 'screen-trutec';
    s.className = 'screen';
    s.innerHTML =
      '<div class="social-bg" aria-hidden="true"></div><div class="social-sheen" aria-hidden="true"></div>' +
      '<div class="tt-wrap">' +
        '<aside class="tt-side">' +
        '<header class="tt-top">' +
          '<button type="button" class="btn btn-secondary tt-exit" id="tt-exit">‹ Sair</button>' +
          '<div class="tt-ante" id="tt-ante">Trutec</div>' +
        '</header>' +
        '<div class="tt-blind" id="tt-blind">' +
          '<div class="tt-bname"><span id="tt-bicon"></span><b id="tt-bname"></b><small id="tt-beffect"></small></div>' +
          '<div class="tt-ring" id="tt-ring" aria-label="Progresso da meta">' +
            '<div class="tt-ring-in"><small>Pontos</small><b id="tt-score">0</b><span>de <b id="tt-target">0</b></span></div>' +
          '</div>' +
          '<div class="tt-bar"><i id="tt-barfill"></i></div>' +
          '<div class="tt-counters"><span>Mãos <b id="tt-hands">0</b></span><span>Trocas <b id="tt-trocas">0</b></span></div>' +
        '</div>' +
        '<div class="tt-calc" id="tt-calc">' +
          '<small class="tt-kicker">Valor da mão</small>' +
          '<div class="tt-cm"><span class="tt-chips" id="tt-chips">30</span><i>×</i><span class="tt-mult" id="tt-mult">1</span></div>' +
          '<div class="tt-total" id="tt-total"></div>' +
          '<div class="tt-pips" id="tt-pips"><i></i><i></i><i></i></div>' +
        '</div>' +
        '<div class="tt-actions">' +
          '<button type="button" class="action-btn" id="tt-truco">TRUCO</button>' +
          '<button type="button" class="action-btn" id="tt-swap">TROCAR</button>' +
          '<button type="button" class="action-btn danger" id="tt-run">FUGIR</button>' +
        '</div>' +
        '<div class="tt-moneybox"><span>Dinheiro</span><div class="tt-money" id="tt-money"></div></div>' +
      '</aside>' +
      '<div class="tt-main">' +
        '<div class="tt-jokers" id="tt-jokers"></div>' +
        '<section class="tt-opp">' +
          '<div class="tt-oppinfo"><span class="tt-oppicon" id="tt-oppicon"></span><span id="tt-oppname"></span></div>' +
          '<div class="tt-opphand" id="tt-opphand"></div>' +
          '<div class="tt-peek" id="tt-peek"></div>' +
        '</section>' +
        '<section class="tt-center">' +
          '<div class="tt-vira"><span>Vira</span><div id="tt-vira"></div><small id="tt-mani"></small></div>' +
          '<div class="tt-table">' +
            '<div class="tt-slot" id="tt-slot-opp"></div>' +
            '<div class="tt-slot" id="tt-slot-me"></div>' +
          '</div>' +
        '</section>' +
        '<div class="tt-msg" id="tt-msg" role="status" aria-live="polite"></div>' +
        '<div class="tt-hand" id="tt-hand"></div>' +
      '</div>' +
      '</div>' +
      '<div class="tt-overlay hidden" id="tt-overlay"><div class="tt-modal" id="tt-modal"></div></div>';
    host.appendChild(s);

    $('tt-exit').addEventListener('click', function () {
      if (!R) return leave();
      modal('Abandonar a corrida?', '<p>Você perde o progresso desta corrida.</p>', [
        { label: 'Continuar jogando', cls: 'btn-primary' }, { label: 'Sair', cls: 'btn-danger', fn: leave }
      ]);
    });
    $('tt-truco').addEventListener('click', playerCall);
    $('tt-run').addEventListener('click', playerRun);
    $('tt-swap').addEventListener('click', function () {
      if (!canSwap()) return;
      H.swapMode = !H.swapMode;
      say(H.swapMode ? 'Toque na carta que você quer trocar.' : 'Troca cancelada.');
      renderActions();
    });
  }

  function cardEl(c, extra) {
    var el = document.createElement('div');
    el.className = 'card ' + COLOR[c.suit] + ' suit-' + c.suit + (extra ? ' ' + extra : '');
    if (isManilha(c)) el.classList.add('manilha');
    var sy = SYM[c.suit];
    el.innerHTML =
      '<div class="card-corner corner-tl"><span>' + c.rank + '</span>' + sy + '</div>' +
      '<div class="card-face"><div class="rank">' + c.rank + '</div><div class="suit">' + sy + '</div></div>' +
      '<div class="card-corner corner-br"><span>' + c.rank + '</span>' + sy + '</div>';
    return el;
  }
  function backEl() { var el = document.createElement('div'); el.className = 'card facedown'; return el; }
  function say(t) { var m = $('tt-msg'); if (m) m.textContent = t; }

  function modal(title, body, buttons, opts) {
    var m = $('tt-modal');
    if (opts && opts.billy) showBilly(opts.billy); else hideBilly();
    m.innerHTML = '<h2></h2><div class="tt-mbody"></div><div class="tt-mbtns"></div>';
    m.querySelector('h2').textContent = title;
    var b = m.querySelector('.tt-mbody');
    if (typeof body === 'string') b.innerHTML = body; else if (body) b.appendChild(body);
    var box = m.querySelector('.tt-mbtns');
    (buttons || []).forEach(function (o) {
      var el = document.createElement('button');
      el.type = 'button';
      el.className = 'btn ' + (o.cls || 'btn-secondary');
      el.textContent = o.label;
      el.addEventListener('click', function () { closeModal(); if (o.fn) o.fn(); });
      box.appendChild(el);
    });
    $('tt-overlay').classList.remove('hidden');
    var f = box.querySelector('button') || m.querySelector('.tt-mbody button'); if (f) f.focus();
  }
  function closeModal() { if (typeof hideTip === 'function') hideTip(); hideBilly(); $('tt-overlay').classList.add('hidden'); }

  // ---------- BILLY, o vendedor ----------
  // Aparece grande à direita da loja, com balão de fala. Esquisitão e SEMPRE com pressa: fala rápido,
  // se impacienta quando você demora (a cada ~8-14s solta uma fala nova) e fica tremendo de ansiedade.
  // Tenta o arquivo principal e, se não existir, algumas variações comuns (a Vercel diferencia maiúsculas de minúsculas).
  var BILLY_SRCS = ['assets/billy.png', 'assets/billy.webp', 'assets/billy.jpg', 'assets/billy.jpeg', 'assets/billy.svg', 'assets/Billy.png'];
  var BILLY = {
    greet: [
      'Entra, entra, anda! Não tenho o dia todo... só a noite toda, na verdade.',
      'Você demorou. Eu já estava atrasado desde ontem.',
      'Rápido! O que vai ser? O relógio está me olhando torto.',
      'Pisca menos, compra mais. Tenho um compromisso com um corvo.',
      'Shhh. Fala baixo e compra rápido. As cartas têm ouvidos.',
      'Três segundos. Contei dois. Anda!',
      'Meu chapéu está me apressando. Ele nunca se engana.',
      'Ah, é você. Compra logo antes que eu me lembre onde estacionei meu cavalo.'
    ],
    poor: [
      'Sem dinheiro? Então volta quando tiver. E rápido!',
      'Seus bolsos fazem eco. Eu odeio eco. Anda, vai ganhar mais!',
      'Olhar não custa nada, mas meu tempo custa. Muito.',
      'Nada no bolso, nada no balcão. Próximo! ...não tem próximo. Vai logo.'
    ],
    buy: [
      'Isso! Agora some... quer dizer, volte sempre. Mas já!',
      'Vendido! Nunca vi esse curinga antes na vida. Não pergunte.',
      'Ótimo, ótimo. Negócio feito. Não conte pro meu chefe.',
      'Pega e vai! Se perguntarem, você nunca me viu.',
      'Dinheiro bom. Cheira a pressa. Gostei.',
      'Pronto! Próximo! ...não tem próximo, é só você. Anda.'
    ],
    sell: [
      'Hm. Vale menos do que parece. Pega o troco e solta!',
      'Já estava de olho nele. Ele também estava de olho em mim.',
      'Aceito! Rápido, antes que ele se arrependa.',
      'Que cheiro é esse? Ah, nostalgia. Passa pra cá.'
    ],
    reroll: [
      'Mais? Tudo bem, tudo bem. Olha só isso, rapidinho!',
      'Chacoalhei a caixa. Ela reclamou. Ignora.',
      'De novo?! Meu tempo é dinheiro. O seu dinheiro, na verdade.',
      'Pronto, sem olhar. Mágica... ou não. Confia.'
    ],
    idle: [
      'Hum? Ainda aqui? Os minutos estão acabando. Os meus, não os seus.',
      'Tic-tac. Tic-tac. Isso sou eu batendo o pé.',
      'Tenho um enterro às cinco. Não é meu. Acho.',
      'Escolhe! A caixa registradora está ficando impaciente.',
      'Vai comprar ou vai só ficar me encarando?',
      'Meus olhos estão secando de tanto esperar.',
      'Psiu. Psiu. Já decidiu? E agora? E agora?',
      'Só um minuto, você disse. Foram nove. Eu contei.'
    ]
  };
  var billyEl = null, billyTimer = 0, billyLast = '', billyTyper = 0;
  function billyLine(kind) {
    var pool = BILLY[kind] || BILLY.greet, line = pool[rnd(pool.length)], tries = 0;
    while (line === billyLast && pool.length > 1 && tries++ < 6) line = pool[rnd(pool.length)];
    billyLast = line;
    return line;
  }

  // ---- voz do Billy: bem mais GROSSA que a do Jailson ----
  // Mesmo esquema do Jailson (um "blip" por letra), mas com onda serrada em ~65-130 Hz (o Jailson fica em ~250 Hz),
  // formantes mais baixos e filtro passa-baixa, pra soar um vozeirão rouco. Segue o volume de "Efeitos sonoros".
  var BV_BASE = 74;                 // tom médio (Hz): menor = mais grave
  var BV_GAP_MS = 62;               // intervalo mínimo entre blips
  var BV_FORMANT = { a: 700, e: 520, i: 340, o: 430, u: 290 };
  var bvCtx = null, bvLast = 0;
  function bvAudio() {
    if (bvCtx) return bvCtx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { bvCtx = new AC(); } catch (e) { bvCtx = null; }
    return bvCtx;
  }
  function bvLevel() {
    var ga = window.GameAudio;
    if (!ga) return 1;
    if (ga.isMuted && ga.isMuted()) return 0;
    return ga.getSfxLevel ? ga.getSfxLevel() : 1;
  }
  function billyBlip(ch, question) {
    if (DEMO) return;
    var lv = bvLevel();
    if (!lv) return;
    var now = performance.now();
    if (now - bvLast < BV_GAP_MS) return;
    var ac = bvAudio();
    if (!ac) return;
    if (ac.state === 'suspended') { try { ac.resume(); } catch (e) {} }
    if (ac.state !== 'running') return;
    bvLast = now;
    var c = ch.toLowerCase(), t = ac.currentTime;
    var code = c.charCodeAt(0) - 97;
    if (code < 0 || code > 25) code = c.charCodeAt(0) % 26;
    var vowel = BV_FORMANT[c.normalize ? c.normalize('NFD').charAt(0) : c];
    var scale = [0, 2, 3, 5, 7, 8, 10];                       // escala menor: soa sombrio/esquisito
    var semi = scale[code % scale.length] + (code > 13 ? 5 : 0) - 4 + (Math.random() * 1.4 - 0.7);
    var f = BV_BASE * Math.pow(2, semi / 12) * (question ? 1.12 : 1);
    var dur = vowel ? 0.12 : 0.07;

    var o1 = ac.createOscillator(), o2 = ac.createOscillator();
    var body = ac.createBiquadFilter(), form = ac.createBiquadFilter(), g = ac.createGain();
    o1.type = 'sawtooth'; o2.type = 'sawtooth';
    o1.frequency.setValueAtTime(f * 1.05, t);                  // começa um pouco acima e "cai": rosnadinho de sílaba
    o1.frequency.exponentialRampToValueAtTime(f * 0.94, t + dur);
    o2.frequency.setValueAtTime(f * 1.012, t);                 // 2ª onda levemente desafinada = voz rouca/grossa
    o2.frequency.exponentialRampToValueAtTime(f * 0.95, t + dur);
    body.type = 'lowpass'; body.frequency.value = 760; body.Q.value = 0.8;
    form.type = 'bandpass'; form.Q.value = vowel ? 3 : 1;
    form.frequency.value = vowel || (480 + (code % 7) * 70);
    var peak = 0.38 * lv * lv;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.018);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o1.connect(body); o2.connect(body); body.connect(form); form.connect(g); g.connect(ac.destination);
    o1.start(t); o2.start(t); o1.stop(t + dur + 0.02); o2.stop(t + dur + 0.02);
  }

  // ---- fala letra por letra (igual ao Jailson) ----
  function billyStopTyping() { clearInterval(billyTyper); billyTyper = 0; if (billyEl) billyEl.classList.remove('talking'); }
  function billySay(kind) {
    if (!billyEl) return;
    var line = billyLine(kind);
    var b = billyEl.querySelector('.tt-bubble');
    var full = b.querySelector('.tt-full'), typed = b.querySelector('.tt-typed');
    b.setAttribute('aria-label', line);
    full.textContent = line;                                   // texto invisível: já reserva o tamanho do balão
    billyStopTyping();
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { typed.textContent = line; return; }
    typed.textContent = '';
    billyEl.classList.add('talking');                          // enquanto fala, o corpo balança de leve
    var pos = 0, isQ = /\?\s*$/.test(line);
    billyTyper = setInterval(function () {
      var from = pos;
      pos += 1 + (pos > 40 ? 1 : 0);
      typed.textContent = line.slice(0, pos);
      for (var k = from; k < Math.min(pos, line.length); k++) {
        if (/[A-Za-zÀ-ÿ]/.test(line.charAt(k))) { billyBlip(line.charAt(k), isQ && pos > line.length - 12); break; }
      }
      if (pos >= line.length) billyStopTyping();
    }, 16);                                                    // o Billy está com pressa: fala mais rápido que o Jailson (18 ms)
  }
  function billyArmIdle() {
    clearTimeout(billyTimer);
    billyTimer = setTimeout(function () { if (!billyEl) return; billySay('idle'); billyArmIdle(); }, 8000 + rnd(6000));
  }
  function showBilly(kind) {
    var ov = $('tt-overlay');
    if (!ov) return;
    var fresh = !billyEl;
    if (fresh) {
      billyEl = document.createElement('div');
      billyEl.className = 'tt-billy';
      billyEl.innerHTML = '<div class="tt-stage"><div class="tt-sway"><div class="tt-body">' +
        '<img class="tt-billyimg" src="' + BILLY_SRCS[0] + '" alt="Billy, o vendedor" draggable="false">' +
        '<div class="tt-bubble" role="status">' +
          '<span class="tt-bg"><i class="tt-tail"></i></span><span class="tt-name">Billy</span>' +
          '<div class="tt-text"><span class="tt-full" aria-hidden="true"></span><span class="tt-typed" aria-hidden="true"></span></div>' +
        '</div>' +
        '</div></div></div>';
      var img = billyEl.querySelector('img'), tryN = 0;
      img.addEventListener('error', function () {
        if (++tryN < BILLY_SRCS.length) { this.src = BILLY_SRCS[tryN]; return; }   // tenta o próximo nome
        this.style.display = 'none';
        if (window.console) console.warn('[Billy] imagem não encontrada. Tentei: ' + BILLY_SRCS.join(', '));
      });
      ov.appendChild(billyEl);
    }
    ov.classList.add('tt-shopmode');
    billySay(kind);
    billyArmIdle();
  }
  function hideBilly() {
    clearTimeout(billyTimer); billyTimer = 0;
    billyStopTyping();
    if (billyEl && billyEl.parentNode) billyEl.parentNode.removeChild(billyEl);
    billyEl = null;
    var ov = $('tt-overlay');
    if (ov) ov.classList.remove('tt-shopmode');
  }

  function setCalc(chips, mult, xm, total, anim) {
    var C = window.TruCount;
    var suf = xm > 1 ? ' ×' + (Math.round(xm * 100) / 100) : '';
    var fm = function (v) { return (Math.round(v * 10) / 10) + suf; };
    var ft = function (v) { return v ? '= ' + fmt(Math.round(v)) : ''; };
    var cEl = $('tt-chips'), mEl = $('tt-mult'), tEl = $('tt-total');
    if (!C) {
      cEl.textContent = Math.round(chips);
      mEl.textContent = fm(mult);
      tEl.textContent = ft(total);
      return;
    }
    if (anim) {
      C.run(cEl, chips, { max: 380, ding: false });
      C.run(mEl, mult, { format: fm, max: 380, ding: false });
    } else {
      C.set(cEl, chips);
      C.set(mEl, mult, { format: fm });
    }
    if (anim && total) C.run(tEl, total, { format: ft, max: 1000 });   // o total sobe e faz "ding"
    else C.set(tEl, total, { format: ft });
  }

  function renderJokers() {
    var box = $('tt-jokers'); box.innerHTML = '';
    for (var i = 0; i < JSLOTS; i++) {
      var id = R && R.jokers[i], j = id && jk(id);
      var el = document.createElement('div');
      el.className = 'tt-joker' + (j ? '' : ' empty'); el.dataset.i = i;
      if (j) { el.title = j.name + ': ' + j.desc; el.innerHTML = '<span class="tj-i">' + ic(j.icon) + '</span><small></small>'; el.lastChild.textContent = j.name; }
      box.appendChild(el);
    }
  }

  function render() {
    if (!R) return;
    $('tt-ante').textContent = 'Ante ' + R.ante + '/' + ANTES;
    $('tt-money').textContent = '$' + R.money;
    renderJokers();
    var b = R.blind;
    if (!b) return;
    $('tt-bicon').innerHTML = ic(b.opp.icon);
    $('tt-bname').textContent = b.opp.name;
    $('tt-beffect').textContent = b.boss ? b.effect : '';
    $('tt-target').textContent = fmt(b.target);
    if (window.TruCount) TruCount.run($('tt-score'), R.score, {
      format: function (v) { return fmt(Math.round(v)); },
      parse: function (t) { return parseInt(String(t).replace(/\./g, ''), 10); },
      max: 900
    });
    else $('tt-score').textContent = fmt(R.score);
    $('tt-barfill').style.width = Math.min(100, R.score / b.target * 100) + '%';
    var rg = $('tt-ring'); if (rg) rg.style.setProperty('--p', Math.min(100, R.score / b.target * 100).toFixed(1));
    $('tt-hands').textContent = R.handsLeft;
    $('tt-trocas').textContent = R.trocasLeft;
    $('tt-oppname').textContent = b.opp.name;
    $('tt-oppicon').innerHTML = ic(b.opp.icon);
    if (!H) return;
    // vira por cima do monte: algumas cartas viradas aparecem escapando por baixo (o "tombo")
    var vi = $('tt-vira'); vi.innerHTML = '';
    var deck = document.createElement('div'); deck.className = 'tt-deck';
    var nb = Math.min(4, H.deck.length);
    for (var bi = 0; bi < nb; bi++) {
      var bk = backEl(), d = (nb - bi) * 0.28;
      bk.style.setProperty('--dx', d + 'rem'); bk.style.setProperty('--dy', d + 'rem');
      bk.style.setProperty('--rot', (bi % 2 ? 1.6 : -1.2) + 'deg');
      deck.appendChild(bk);
    }
    deck.appendChild(cardEl(H.vira, 'tt-viracard'));
    vi.appendChild(deck);
    $('tt-mani').textContent = 'Manilha: ' + H.mani;
    var oh = $('tt-opphand'); oh.innerHTML = '';
    H.opp.forEach(function () { oh.appendChild(backEl()); });
    var pk = $('tt-peek');
    if (hasJ('olho') && H.opp.length) {
      var mn = 0, th = 0;
      H.opp.forEach(function (c) { if (power(c) >= 100) mn++; else if (c.rank === '3') th++; });
      pk.innerHTML = ic('olho', 'tt-ic-inline') + ' ' + mn + ' manilha' + (mn === 1 ? '' : 's') + ' e ' + th + ' três no rival';
    } else pk.textContent = '';
    ['me', 'opp'].forEach(function (w) {
      var slot = $('tt-slot-' + w); slot.innerHTML = ''; slot.className = 'tt-slot';
      if (H.table[w]) slot.appendChild(cardEl(H.table[w]));
    });
    var pips = $('tt-pips').children;
    for (var i = 0; i < 3; i++) pips[i].className = H.results[i] === 'me' ? 'on' : H.results[i] === 'opp' ? 'lost' : H.results[i] === 'tie' ? 'tie' : '';
    if (!H.scoring) setCalc(CHIPS0, stakeMult(H.level), 1, 0);
    var hand = $('tt-hand'); hand.innerHTML = '';
    H.me.forEach(function (c, i) {
      var el = cardEl(c, 'tt-mine' + (H.dealing ? ' dealing' : ''));
      if (H.dealing) {
        el.style.animationDelay = (i * 120) + 'ms';
        el.addEventListener('animationend', function () { el.classList.remove('dealing'); el.style.animationDelay = ''; });
      }
      el.addEventListener('click', function () { onCard(i); });
      hand.appendChild(el);
    });
    H.dealing = false;
    renderActions();
  }

  function canSwap() { return !!H && H.canAct && R.trocasLeft > 0 && H.played.length === 0 && !H.table.me; }

  function renderActions() {
    if (!H) return;
    var t = $('tt-truco');
    t.disabled = !(H.canAct && H.level < 4 && H.lastRaiser !== 'me');
    t.textContent = CALLS[Math.min(H.level + 1, 4)];
    $('tt-run').disabled = !H.canAct;
    var s = $('tt-swap');
    s.disabled = !canSwap();
    s.textContent = 'TROCAR (' + R.trocasLeft + ')';
    s.classList.toggle('active', !!H.swapMode);
    document.querySelectorAll('#tt-hand .card').forEach(function (el) {
      el.classList.toggle('playable', !!H.canAct);
      el.classList.toggle('swapping', !!H.swapMode);
    });
  }

  // ============================================================================
  // FLUXO: corrida → blind → mão → vaza
  // ============================================================================
  function open() {
    build();
    if (window.showScreen) window.showScreen('screen-trutec');
    else { document.querySelectorAll('.screen').forEach(function (e) { e.classList.remove('active'); }); $('screen-trutec').classList.add('active'); }
    tok++; R = null; H = null;
    ['tt-hand', 'tt-opphand', 'tt-vira', 'tt-slot-me', 'tt-slot-opp', 'tt-jokers'].forEach(function (id) { $(id).innerHTML = ''; });
    $('tt-ante').textContent = 'Trutec'; $('tt-money').textContent = ''; $('tt-bname').textContent = 'Roguelike solo';
    $('tt-bicon').innerHTML = ic('maocheia'); $('tt-beffect').textContent = ''; $('tt-oppname').textContent = ''; $('tt-oppicon').textContent = '';
    $('tt-target').textContent = '0'; $('tt-score').textContent = '0'; $('tt-barfill').style.width = '0';
    var rg0 = $('tt-ring'); if (rg0) rg0.style.setProperty('--p', 0);
    $('tt-hands').textContent = '0'; $('tt-trocas').textContent = '0'; $('tt-mani').textContent = ''; $('tt-peek').textContent = '';
    setCalc(CHIPS0, 1, 1, 0); say('');
    $('tt-truco').disabled = true; $('tt-run').disabled = true; $('tt-swap').disabled = true;
    intro();
  }
  function leave() {
    tok++; R = H = null; closeModal();
    if (window.showScreen) window.showScreen('screen-lobby');
  }

  function intro() {
    var b = best();
    modal('Trutec',
      '<p>Truco paulista roguelike, estilo Balatro.</p><ul class="tt-rules">' +
      '<li>Cada <b>blind</b> tem uma <b>meta de pontos</b>. Você tem poucas <b>mãos</b> pra bater a meta.</li>' +
      '<li>Mão ganha vale <b>Fichas × Mult</b>. O valor do truco é o seu Mult: <b>TRUCO ×3, SEIS ×6, NOVE ×9, DOZE ×12</b>.</li>' +
      '<li>Perder uma mão valendo truco+ custa dinheiro. Fugir não custa, mas gasta a mão.</li>' +
      '<li>Ganhe <b>$</b>, compre <b>curingas</b> na loja e monte combos. Use as <b>trocas</b> pra melhorar a mão.</li>' +
      '<li>Chefes mudam as regras. Vença os 4 Antes pra ser campeão.</li></ul>' +
      (b ? '<p class="tt-best">Recorde: ' + b + ' blind' + (b === 1 ? '' : 's') + ' vencida' + (b === 1 ? '' : 's') + ' de ' + (ANTES * 3) + '</p>' : ''),
      [{ label: 'Começar corrida', cls: 'btn-primary', fn: startRun }, { label: 'Voltar', fn: leave }]);
  }

  function startRun() {
    tok++;
    R = { ante: 1, bi: 0, money: START_MONEY, jokers: [], vouchers: [], score: 0, cleared: 0, blind: null, handsLeft: 0, trocasLeft: 0 };
    H = null;
    blindSelect();
  }

  function makeBlind() {
    var a = R.ante, bi = R.bi, kind = ['small', 'big', 'boss'][bi];
    var target = Math.round(BASE[a - 1] * BMULT[bi] / 5) * 5;
    var o, boss = null, title;
    if (kind === 'boss') { boss = BOSSES[a - 1]; o = boss; title = 'Chefe: ' + boss.name; }
    else if (kind === 'big') { o = BIGOPP[a - 1]; title = 'Blind Grande'; }
    else { o = SMALLOPP[a - 1]; title = 'Blind Pequena'; }
    var opp = { name: o.name, icon: o.icon, bio: o.bio, skill: 0.28 + 0.14 * (a - 1) + 0.05 * bi, bluff: 0.06 + 0.05 * bi, aggr: 0.25 + 0.05 * bi };
    if (boss && boss.key === 'beto') { opp.aggr = 0.95; opp.bluff = 0.35; }
    if (boss && boss.key === 'coringa') { opp.skill = 0.95; opp.aggr = 0.7; }
    return { kind: kind, title: title, target: target, reward: BREWARD[bi], opp: opp, boss: boss ? boss.key : null, effect: boss ? boss.effect : '' };
  }

  function blindSelect() {
    tok++;
    R.blind = makeBlind(); R.score = 0; H = null;
    render();
    var b = R.blind;
    var body = '<p class="tt-bigicon">' + ic(b.opp.icon) + '</p><p><b>' + b.opp.name + '</b><br>' + b.opp.bio + '</p>' +
      '<p class="tt-goalbig">Meta: <b>' + fmt(b.target) + '</b> pontos</p>' +
      '<p>Recompensa: <b>$' + b.reward + '</b> + $1 por mão que sobrar + juros</p>' +
      (b.boss ? '<p class="tt-bosseffect">' + ic('alerta', 'tt-ic-inline') + ' ' + b.effect + '</p>' : '');
    var btns = [{ label: 'Jogar', cls: 'btn-primary', fn: beginBlind }];
    if (b.kind !== 'boss') btns.push({ label: 'Pular (+$3, sem loja)', fn: function () { R.money += 3; advance(); blindSelect(); } });
    modal('Ante ' + R.ante + ' — ' + b.title, body, btns);
  }

  function advance() { R.bi++; if (R.bi > 2) { R.bi = 0; R.ante++; } }

  function beginBlind() {
    tok++;
    var boss = R.blind.boss;
    R.score = 0;
    R.handsLeft = HANDS + (hasV('maoextra') ? 1 : 0) - (boss === 'coringa' ? 1 : 0);
    R.trocasLeft = boss === 'marquinhos' ? 0 : TROCAS + (hasV('baralho') ? 1 : 0) + (hasJ('gato') ? 1 : 0);
    R.leader = Math.random() < 0.5 ? 'me' : 'opp';
    render();
    newHand();
  }

  function newHand() {
    tok++;
    var d = shuffle(makeDeck());
    H = {
      me: [d.pop(), d.pop(), d.pop()], opp: [d.pop(), d.pop(), d.pop()], vira: d.pop(), deck: d,
      level: 0, pending: 0, lastRaiser: null, called: false, results: [], table: { me: null, opp: null },
      turn: R.leader, trickLeader: R.leader, canAct: false, swapMode: false, scoring: false,
      played: [], won: [], dealing: true
    };
    H.mani = RANKS[(RANKS.indexOf(H.vira.rank) + 1) % RANKS.length];
    render();
    for (var di = 0; di < H.me.length; di++) cardSfx('cardDeal', di * 0.12, di);
    say(R.leader === 'me' ? 'Você abre a mão.' : 'O rival abre a mão.');
    later(nextAction, 900);
  }

  function nextAction() {
    if (H.turn === 'me') { H.canAct = true; renderActions(); say('Sua vez.'); }
    else aiTurn();
  }

  function onCard(i) {
    if (!H || !H.canAct) return;
    if (H.swapMode) {
      if (!H.deck.length || R.trocasLeft < 1) return;
      H.me[i] = H.deck.pop();
      R.trocasLeft--; H.swapMode = false;
      cardSfx('cardDeal'); say('Carta trocada.'); render();
      return;
    }
    playCard('me', i);
  }

  // carta voa da mão (ou de cima, no caso do rival) até o lugar dela na mesa
  function flightSource(who, idx) {
    if (who === 'me') {
      var he = document.querySelectorAll('#tt-hand .card')[idx];
      if (!he) return null;
      var r = he.getBoundingClientRect();
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: he.offsetWidth, rot: getComputedStyle(he).getPropertyValue('--r').trim() || '0deg' };
    }
    var so = $('tt-slot-opp').getBoundingClientRect();
    return { cx: so.left + so.width / 2, cy: so.top - so.height * 0.9, w: so.width * 0.75, rot: '0deg' };
  }
  function flyCard(who, src) {
    var el = document.querySelector('#tt-slot-' + who + ' .card');
    if (!el || !src || !el.animate) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var d = el.getBoundingClientRect();
    if (!d.width) return;
    var dx = src.cx - (d.left + d.width / 2), dy = src.cy - (d.top + d.height / 2), sc = src.w / el.offsetWidth;
    el.animate([
      { transform: 'translate(' + dx + 'px,' + dy + 'px) rotate(' + src.rot + ') scale(' + sc + ')' },
      { transform: 'none' }
    ], { duration: 300, easing: 'cubic-bezier(.2, .8, .25, 1)' });
  }

  function playCard(who, idx) {
    var src = flightSource(who, idx);
    var c = H[who].splice(idx, 1)[0];
    H.table[who] = c; H.canAct = false; H.swapMode = false;
    if (who === 'me') H.played.push(c);
    cardSfx('cardPlay'); render(); flyCard(who, src);
    if (H.table.me && H.table.opp) { later(resolveTrick, 900); return; }
    H.turn = other(who);
    later(nextAction, who === 'me' ? 600 : 0);
  }

  function resolveTrick() {
    var pm = power(H.table.me), po = power(H.table.opp);
    var r = pm > po ? 'me' : po > pm ? 'opp' : 'tie';
    if (r === 'tie' && hasJ('coelho')) r = 'me';
    H.results.push(r);
    if (r === 'me') H.won.push(H.table.me);
    var ws = r === 'tie' ? null : $('tt-slot-' + r);
    if (ws) ws.classList.add('won');
    say(r === 'me' ? 'Você levou a vaza!' : r === 'opp' ? 'O rival levou a vaza.' : 'Empatou! (cangou)');
    var pips = $('tt-pips').children; pips[H.results.length - 1].className = r === 'me' ? 'on' : r === 'opp' ? 'lost' : 'tie';
    later(function () {
      H.table = { me: null, opp: null };
      var w = handWinner(H.results);
      if (w === 'draw') return endHand(null, 'draw');
      if (w) return endHand(w, 'cards');
      H.turn = r === 'tie' ? H.trickLeader : r;
      H.trickLeader = H.turn;
      render(); nextAction();
    }, 1200);
  }

  // ---------- pontuação (Fichas × Mult) ----------
  function computeScore(how) {
    var steps = [], chips, mult, xm = 1, money = 0;
    if (how === 'run') { chips = 0; mult = 1; }
    else {
      chips = CHIPS0; mult = stakeMult(H.level);
      H.won.forEach(function (c) { var v = cardChips(c); chips += v; steps.push({ t: 'card', label: c.rank + SYM[c.suit] + ' +' + v + ' fichas', chips: chips, mult: mult, xm: xm }); });
    }
    var x = { how: how, level: H.level, results: H.results, played: H.played, won: H.won, called: H.called, money: R.money, handsLeft: R.handsLeft - 1 };
    R.jokers.forEach(function (id, i) {
      var j = jk(id); if (!j || !j.calc) return;
      if (how === 'run' && !j.onRun) return;
      var e = j.calc(x); if (!e) return;
      var txt = [];
      if (e.chips) { chips += e.chips; txt.push('+' + e.chips + ' fichas'); }
      if (e.mult) { mult += e.mult; txt.push('+' + e.mult + ' mult'); }
      if (e.xmult) { xm *= e.xmult; txt.push('×' + e.xmult + ' mult'); }
      if (e.money) { money += e.money; txt.push('+$' + e.money); }
      steps.push({ t: 'joker', idx: i, label: j.name + ' ' + txt.join(' '), chips: chips, mult: mult, xm: xm });
    });
    return { steps: steps, chips: chips, mult: mult, xm: xm, money: money, total: how === 'run' && !chips ? 0 : Math.round(chips * mult * xm) };
  }

  // número grande no meio da tela que "cai" em cima da pontuação e é somado
  function flyTotal(total, land) {
    var t = tok, sc = $('tt-score'), ring = $('tt-ring');
    var el = document.createElement('div');
    el.className = 'tt-fly'; el.textContent = '+' + fmt(total);
    document.body.appendChild(el);
    var gone = false;
    function kill() { if (gone) return; gone = true; if (el.parentNode) el.parentNode.removeChild(el); }
    setTimeout(kill, 4000);                                     // segurança
    var mid = document.querySelector('#screen-trutec .tt-center') || document.body;
    var mr = mid.getBoundingClientRect();
    var cx = mr.left + mr.width / 2, cy = mr.top + mr.height / 2;
    var at = function (x, y, sc2, rot) { return 'translate(' + x + 'px,' + y + 'px) translate(-50%,-50%) scale(' + sc2 + ') rotate(' + rot + 'deg)'; };
    sfx();
    var pop = el.animate([
      { transform: at(cx, cy, .15, -10), opacity: 0 },
      { transform: at(cx, cy, 1.4, 4), opacity: 1, offset: .55 },
      { transform: at(cx, cy, 1, -2), opacity: 1 }
    ], { duration: 420, easing: 'ease-out', fill: 'forwards' });
    pop.onfinish = function () {
      later(function () {
        if (t !== tok) return kill();
        var r = sc.getBoundingClientRect();
        var tx = r.left + r.width / 2, ty = r.top + r.height / 2;
        var fly = el.animate([
          { transform: at(cx, cy, 1, -2) },
          { transform: at(cx, cy - 18, 1.12, -4), offset: .22 },
          { transform: at(tx, ty, .3, 0), opacity: 1, offset: .92 },
          { transform: at(tx, ty, .2, 0), opacity: 0 }
        ], { duration: 480, easing: 'cubic-bezier(.55,0,.9,.55)', fill: 'forwards' });
        fly.onfinish = function () {
          kill();
          if (t !== tok) return;
          impact(tx, ty, ring);
          land();
        };
      }, 480);
    };
  }
  function impact(x, y, ring) {
    var boom = document.createElement('div');
    boom.className = 'tt-boom'; boom.style.left = x + 'px'; boom.style.top = y + 'px';
    document.body.appendChild(boom);
    setTimeout(function () { if (boom.parentNode) boom.parentNode.removeChild(boom); }, 700);
    for (var i = 0; i < 10; i++) {
      var sp = document.createElement('i');
      sp.className = 'tt-spark'; sp.style.left = x + 'px'; sp.style.top = y + 'px';
      document.body.appendChild(sp);
      var a = (i / 10) * Math.PI * 2 + Math.random() * .4, d = 36 + Math.random() * 40;
      sp.animate([
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
        { transform: 'translate(calc(-50% + ' + Math.cos(a) * d + 'px), calc(-50% + ' + Math.sin(a) * d + 'px)) scale(.2)', opacity: 0 }
      ], { duration: 420 + Math.random() * 160, easing: 'ease-out', fill: 'forwards' });
      (function (e) { setTimeout(function () { if (e.parentNode) e.parentNode.removeChild(e); }, 700); })(sp);
    }
    if (ring) { ring.classList.remove('tt-hit'); void ring.offsetWidth; ring.classList.add('tt-hit'); setTimeout(function () { ring.classList.remove('tt-hit'); }, 600); }
  }

  function animateScore(res, done) {
    H.scoring = true;
    setCalc(res.steps.length ? CHIPS0 : res.chips, stakeMult(H.level), 1, 0);
    res.steps.forEach(function (s, i) {
      later(function () {
        setCalc(s.chips, s.mult, s.xm, 0, true);
        say(s.label);
        if (s.t === 'joker') {
          var el = document.querySelector('#tt-jokers .tt-joker[data-i="' + s.idx + '"]');
          if (el) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
        }
        sfx();
      }, 550 * (i + 1));
    });
    var n = res.steps.length, T = 550 * (n + 1);
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var fancy = !DEMO && res.total > 0 && !reduced && $('tt-score') && Element.prototype.animate;
    var land = function () {
      R.score += res.total; R.money += res.money; H.scoring = false;
      render(); done();
    };
    // com a animação, o total não aparece no painel (o número grande faz esse papel)
    later(function () { setCalc(res.chips, res.mult, res.xm, fancy ? 0 : res.total, true); say('+' + fmt(res.total) + ' pontos!'); }, T);
    if (fancy) later(function () { flyTotal(res.total, land); }, T + 150);
    else later(land, T + 1100);
  }

  function endHand(winner, how) {
    H.canAct = false;
    if (how === 'draw') { say('Mão empatada: ninguém pontua.'); return later(handDone, 1600); }
    if (how === 'run') {
      var rr = computeScore('run');
      if (rr.total > 0) return animateScore(rr, handDone);
      say('Você fugiu. Mão perdida, mas sem custo.'); return later(handDone, 1600);
    }
    if (winner === 'me') {
      say(how === 'oppRun' ? 'O rival correu!' : 'Você ganhou a mão!');
      return later(function () { animateScore(computeScore(how), handDone); }, 800);
    }
    var pen = Math.min(R.money, H.level);
    R.money -= pen;
    say('O rival ganhou a mão.' + (pen ? ' Você perdeu $' + pen + '.' : '')); render();
    later(handDone, 1800);
  }

  function handDone() {
    R.handsLeft--; render();
    if (R.score >= R.blind.target) return blindWon();
    if (R.handsLeft <= 0) return gameOver();
    R.leader = other(R.leader);
    newHand();
  }

  // ---------- fim de blind / loja ----------
  function blindWon() {
    var b = R.blind;
    H = null;
    R.cleared++; saveBest(R.cleared);
    var interestCap = hasV('juros') ? 10 : 5;
    var interest = Math.min(interestCap, Math.floor(R.money / 5));
    var hl = Math.max(0, R.handsLeft);
    var total = b.reward + hl + interest;
    R.money += total;
    render();
    var isLast = b.kind === 'boss' && R.ante >= ANTES;
    var body = '<ul class="tt-pay"><li><span>Blind vencida</span><b>$' + b.reward + '</b></li>' +
      '<li><span>Mãos que sobraram (' + hl + ')</span><b>$' + hl + '</b></li>' +
      '<li><span>Juros ($1 a cada $5)</span><b>$' + interest + '</b></li></ul>' +
      '<p class="tt-best">Você tem $' + R.money + '</p>';
    if (isLast) return modal('Campeão do Trutec!', '<p class="tt-bigicon">' + ic('trofeu') + '</p><p>Você derrotou O Coringa e venceu os ' + ANTES + ' Antes!</p>' + body,
      [{ label: 'Nova corrida', cls: 'btn-primary', fn: startRun }, { label: 'Sair', fn: leave }]);
    modal('Blind vencida!', body, [{ label: 'Ir à loja', cls: 'btn-primary', fn: openShop }]);
  }

  function openShop() {
    var pool = shuffle(JOKERS.filter(function (j) { return R.jokers.indexOf(j.id) < 0; })).slice(0, 3);
    var items = pool.map(function (j) { return { type: 'joker', id: j.id, price: j.price }; });
    var vs = VOUCHERS.filter(function (v) { return R.vouchers.indexOf(v.id) < 0; });
    if (vs.length) { var v = vs[rnd(vs.length)]; items.push({ type: 'voucher', id: v.id, price: v.price }); }
    R.shop = { items: items, rerolls: 0 };
    shopShownMoney = null;
    renderShop('greet');
  }

  // ---- cardzinhos da loja: nome e descrição aparecem numa dica ao passar o mouse (ou tocar/focar) ----
  var tipEl = null;
  function hideTip() { if (tipEl) tipEl.classList.remove('show'); }
  function showTip(face, name, desc) {
    var ov = $('tt-overlay');
    if (!tipEl) {
      tipEl = document.createElement('div'); tipEl.className = 'tt-tip'; tipEl.setAttribute('role', 'tooltip');
      tipEl.innerHTML = '<b></b><small></small>'; ov.appendChild(tipEl);
    }
    tipEl.querySelector('b').textContent = name; tipEl.querySelector('small').textContent = desc;
    tipEl.classList.add('show');
    var r = face.getBoundingClientRect(), o = ov.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    var x = Math.max(w / 2 + 8, Math.min(o.width - w / 2 - 8, r.left - o.left + r.width / 2));
    var above = r.top - o.top - h - 10 >= 6;                  // sem espaço em cima: abre embaixo
    tipEl.style.left = x + 'px';
    tipEl.style.top = (above ? r.top - o.top - h - 10 : r.bottom - o.top + 10) + 'px';
  }
  function emptySlot() {
    var w = document.createElement('div'); w.className = 'tt-sc empty';
    var f = document.createElement('div'); f.className = 'tt-sc-face';
    w.appendChild(f);
    return w;
  }
  // o: { label, voucher, poor, just, i }
  function shopCard(d, name, tag, button, o) {
    o = o || {};
    var w = document.createElement('div'); w.className = 'tt-sc' + (o.poor ? ' poor' : '') + (o.just ? ' just' : '');
    if (o.i !== undefined) w.style.setProperty('--i', o.i);
    var f = document.createElement('div'); f.className = 'tt-sc-face' + (o.voucher ? ' voucher' : ''); f.tabIndex = 0;
    f.innerHTML = ic(d.icon) + (tag ? '<span class="tt-sc-tag">' + tag + '</span>' : '');
    f.setAttribute('aria-label', name + ': ' + d.desc);
    var on = function () { showTip(f, name, d.desc); };
    f.addEventListener('mouseenter', on); f.addEventListener('focus', on);
    f.addEventListener('mouseleave', hideTip); f.addEventListener('blur', hideTip);
    var nm = document.createElement('span'); nm.className = 'tt-sc-name'; nm.textContent = o.label || d.name;
    w.appendChild(f); w.appendChild(nm); w.appendChild(button);
    return w;
  }
  function shopSnd(k) { if (DEMO) return; try { if (window.TruCount && TruCount.sfx) TruCount.sfx(k); } catch (e) {} }
  function shopBtn(label, price, cls, fn, dis, title) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + cls; b.disabled = !!dis;
    var s = document.createElement('span'); s.textContent = label; b.appendChild(s);
    if (price !== undefined) { var p = document.createElement('span'); p.className = 'tt-price'; p.textContent = '$' + price; b.appendChild(p); }
    if (title) b.title = title;
    b.addEventListener('click', fn);
    return b;
  }
  function rollItems() {
    var owned = R.jokers.slice();
    var pool = shuffle(JOKERS.filter(function (j) { return owned.indexOf(j.id) < 0; })).slice(0, 3);
    var items = pool.map(function (j) { return { type: 'joker', id: j.id, price: j.price }; });
    var vs = VOUCHERS.filter(function (v) { return R.vouchers.indexOf(v.id) < 0; });
    if (vs.length) { var v = vs[rnd(vs.length)]; items.push({ type: 'voucher', id: v.id, price: v.price }); }
    return items;
  }
  function panel(cls, title, count, full) {
    var p = document.createElement('section'); p.className = 'tt-panel ' + cls;
    if (cls.indexOf('tt-stall') >= 0) { var a = document.createElement('div'); a.className = 'tt-awning'; a.setAttribute('aria-hidden', 'true'); p.appendChild(a); }
    var h = document.createElement('h3'); h.className = 'tt-ribbon'; h.textContent = title;
    if (count) { var c = document.createElement('span'); c.className = 'tt-slotcount' + (full ? ' full' : ''); c.textContent = count; h.appendChild(c); }
    p.appendChild(h);
    return p;
  }

  var shopShownMoney = null;      // dinheiro mostrado na última vez que a loja foi desenhada (pra animar a mudança)
  function renderShop(kind) {
    hideTip();
    var S = R.shop, box = document.createElement('div'); box.className = 'tt-shop';

    // ---- carteira: moeda + dinheiro (sobe contando quando ganha; treme e mostra "-$" quando gasta) ----
    var row = document.createElement('div'); row.className = 'tt-walletrow';
    var wal = document.createElement('div'); wal.className = 'tt-wallet';
    var coin = document.createElement('span'); coin.className = 'tt-coin'; coin.textContent = '$'; coin.setAttribute('aria-hidden', 'true');
    var num = document.createElement('b'); num.setAttribute('aria-label', 'Dinheiro: ' + R.money);
    wal.appendChild(coin); wal.appendChild(num);
    var prev = shopShownMoney; shopShownMoney = R.money;
    if (prev === null || prev === R.money) num.textContent = R.money;
    else {
      var up = R.money > prev, dl = document.createElement('i');
      dl.className = 'tt-delta ' + (up ? 'up' : 'down'); dl.textContent = (up ? '+$' : '−$') + Math.abs(R.money - prev);
      wal.appendChild(dl); wal.classList.add(up ? 'gain' : 'lose');
      if (up && window.TruCount) { num.textContent = prev; TruCount.run(num, R.money, { ding: false, max: 600 }); }
      else num.textContent = R.money;
    }
    row.appendChild(wal);
    if (R.vouchers.length) {                                    // vouchers já comprados (permanentes)
      var pm = document.createElement('div'); pm.className = 'tt-perms'; pm.setAttribute('aria-label', 'Permanentes');
      R.vouchers.forEach(function (id) {
        var d = vc(id), sp = document.createElement('span'); sp.className = 'tt-perm';
        sp.title = d.name + ': ' + d.desc; sp.innerHTML = ic(d.icon); pm.appendChild(sp);
      });
      row.appendChild(pm);
    }
    box.appendChild(row);

    // ---- seus curingas ----
    var pOwn = panel('tt-own' + (kind === 'greet' ? ' tt-fresh' : ''), 'Seus curingas', R.jokers.length + '/' + JSLOTS, R.jokers.length >= JSLOTS);
    var own = document.createElement('div'); own.className = 'tt-shopcards';
    for (var k = 0; k < JSLOTS; k++) {                          // os 5 slots existem sempre; os livres aparecem vazios
      if (k >= R.jokers.length) { own.appendChild(emptySlot()); continue; }
      (function (i) {
        var j = jk(R.jokers[i]), sell = Math.floor(j.price / 2);
        var sb = shopBtn('Vender', sell, 'tt-sell', function () { shopSnd('sell'); R.jokers.splice(i, 1); R.money += sell; render(); renderShop('sell'); });
        own.appendChild(shopCard(j, j.name, '', sb, { just: kind === 'buy' && i === R.jokers.length - 1, i: i }));
      })(k);
    }
    pOwn.appendChild(own); box.appendChild(pOwn);

    // ---- a barraquinha ----
    var pShop = panel('tt-stall' + (kind === 'greet' || kind === 'reroll' ? ' tt-fresh' : ''), 'Loja');
    var list = document.createElement('div'); list.className = 'tt-shopcards';
    if (!S.items.length) { var e2 = document.createElement('p'); e2.className = 'tt-best'; e2.textContent = 'Esgotado. Role a loja!'; list.appendChild(e2); }
    S.items.forEach(function (it, i) {
      var d = it.type === 'joker' ? jk(it.id) : vc(it.id);
      var full = it.type === 'joker' && R.jokers.length >= JSLOTS;
      var poor = R.money < it.price;
      var buy = full ? shopBtn('Sem espaço', undefined, 'tt-buy', function () {}, true, 'Venda um curinga pra abrir espaço')
        : shopBtn('Comprar', it.price, 'tt-buy', function () {
            shopSnd('buy');
            R.money -= it.price;
            if (it.type === 'joker') R.jokers.push(it.id); else R.vouchers.push(it.id);
            S.items.splice(i, 1); render(); renderShop('buy');
          }, poor, poor ? 'Faltam $' + (it.price - R.money) : '');
      list.appendChild(shopCard(d, d.name + (it.type === 'voucher' ? ' (permanente)' : ''), it.type === 'voucher' ? 'PERM.' : '', buy,
        { label: d.name, voucher: it.type === 'voucher', poor: poor || full, i: i }));
    });
    pShop.appendChild(list);
    var cost = 3 + S.rerolls;
    pShop.appendChild(shopBtn('Rolar loja', cost, 'tt-reroll', function () {
      shopSnd('roll');
      R.money -= cost; S.rerolls++;
      S.items = rollItems(); render(); renderShop('reroll');
    }, R.money < cost, R.money < cost ? 'Faltam $' + (cost - R.money) : ''));
    box.appendChild(pShop);

    var cheapest = S.items.reduce(function (m, it) { return Math.min(m, it.price); }, Infinity);
    var speech = (kind === 'greet' && S.items.length && R.money < cheapest) ? 'poor' : (kind || 'greet');
    modal('Loja', box, [{ label: 'Próxima blind ›', cls: 'btn-primary tt-go', fn: function () { advance(); blindSelect(); } }], { billy: speech });
    fitShop();
  }

  // a loja não deve precisar de rolagem: se a tela for baixa demais, encolhe as cartinhas aos poucos até caber
  function fitShop() {
    var m = $('tt-modal');
    if (!m || !m.querySelector('.tt-shop')) return;
    m.style.removeProperty('--shopscale');
    var sc = 1, n = 0;
    while (m.scrollHeight > m.clientHeight + 1 && n++ < 10 && sc > 0.4) { sc -= 0.06; m.style.setProperty('--shopscale', sc.toFixed(2)); }
  }
  window.addEventListener('resize', function () { var ov = $('tt-overlay'); if (ov && !ov.classList.contains('hidden') && ov.classList.contains('tt-shopmode')) fitShop(); });

  function gameOver() {
    var b = R.blind;
    H = null;
    modal('Fim da corrida', '<p>Você fez <b>' + fmt(R.score) + '</b> de <b>' + fmt(b.target) + '</b> pontos contra ' + b.opp.name + '.</p>' +
      '<p class="tt-best">Ante ' + R.ante + ' · ' + b.title + ' · Blinds vencidas: ' + R.cleared + '/' + (ANTES * 3) + ' · Recorde: ' + Math.max(best(), R.cleared) + '</p>',
      [{ label: 'Nova corrida', cls: 'btn-primary', fn: startRun }, { label: 'Sair', fn: leave }]);
  }

  // ============================================================================
  // TRUCO: pedidos e respostas
  // ============================================================================
  function playerRun() {
    if (!H || !H.canAct) return;
    endHand('opp', 'run');
  }
  function playerCall() {
    if (!H || !H.canAct || H.level >= 4 || H.lastRaiser === 'me') return;
    H.canAct = false; renderActions();
    H.pending = H.level + 1; H.called = true;
    say('Você pediu ' + CALLS[H.pending] + '!'); sfx(CALLS[H.pending].toLowerCase());
    later(aiRespond, 1000);
  }

  // ---------- IA ----------
  function cv(c) { var p = power(c); return p >= 100 ? 0.82 + (p - 100) * 0.06 : 0.08 + RANKS.indexOf(c.rank) * 0.075; }
  function est(cards, res, who) {
    var v = cards.map(cv).sort(function (a, b) { return b - a; });
    if (!v.length) return 0;
    var w = 0, l = 0;
    res.forEach(function (r) { if (r === who) w++; else if (r && r !== 'tie') l++; });
    if (!res.length) return v[0] * 0.45 + (v[1] || 0) * 0.35 + (v[2] || 0) * 0.2;
    if (v.length === 2) {
      if (w > l) return 0.5 + v[0] * 0.5;
      if (l > w) return v[1] * 0.45 + v[0] * 0.2;
      return v[0] * 0.85 + v[1] * 0.1;
    }
    if (w > l) return Math.min(1, 0.55 + v[0] * 0.45);
    if (l > w) return v[0] * 0.5;
    return v[0];
  }
  function noise(o) { return (Math.random() - 0.5) * (1 - o.skill) * 0.6; }

  function aiTurn() {
    H.canAct = false; renderActions(); say('O rival está pensando…');
    later(function () {
      var o = R.blind.opp, e = est(H.opp, H.results, 'opp') + noise(o);
      if (H.level < 4 && H.lastRaiser !== 'opp') {
        var p = e > 0.64 - o.aggr * 0.12 ? 0.3 + o.aggr * 0.4 : o.bluff;
        if (Math.random() < p) return aiCall();
      }
      aiPlay();
    }, 900);
  }
  function aiCall() {
    H.pending = H.level + 1;
    say('O rival pediu ' + CALLS[H.pending] + '!');
    later(function () { sfx(CALLS[H.pending].toLowerCase()); showResponse(); }, 600);   // som e card juntos
  }
  function aiPlay() {
    var o = R.blind.opp, hand = H.opp;
    var order = hand.map(function (c, i) { return i; }).sort(function (a, b) { return power(hand[a]) - power(hand[b]); });
    var pick;
    if (Math.random() < (1 - o.skill) * 0.35) pick = rnd(hand.length);
    else if (H.table.me) {
      var mp = power(H.table.me);
      var beat = order.filter(function (i) { return power(hand[i]) > mp; });
      pick = beat.length ? beat[0] : order[0];
    } else if (!H.results.length && order.length === 3 && Math.random() < 0.6) pick = order[1];
    else pick = order[order.length - 1];
    playCard('opp', pick);
  }
  function aiRespond() {
    var o = R.blind.opp, e = est(H.opp, H.results, 'opp') + noise(o);
    var thr = 0.42 + 0.06 * H.pending - o.aggr * 0.06;
    if (e < thr) {
      say('O rival correu!');
      return later(function () { endHand('me', 'oppRun'); }, 900);
    }
    if (e > 0.86 && H.pending < 4 && Math.random() < 0.45) {
      H.level = H.pending; H.lastRaiser = 'opp'; H.pending = H.level + 1;
      say('O rival aceitou e pediu ' + CALLS[H.pending] + '!');
      return later(function () { sfx(CALLS[H.pending].toLowerCase()); showResponse(); }, 800);   // som e card juntos
    }
    H.level = H.pending; H.lastRaiser = 'me';
    render(); say('O rival aceitou! Agora vale ×' + stakeMult(H.level) + '.');
    later(nextAction, 900);
  }
  function showResponse() {
    var btns = [
      { label: 'Aceitar', cls: 'btn-primary', fn: function () {
          H.level = H.pending; H.lastRaiser = 'opp'; render();
          say('Você aceitou. Agora vale ×' + stakeMult(H.level) + '.');
          later(nextAction, 800);
      } },
      { label: 'Correr', cls: 'btn-danger', fn: function () { endHand('opp', 'run'); } }
    ];
    if (H.pending < 4) btns.splice(1, 0, { label: 'Pedir ' + CALLS[H.pending + 1], fn: function () {
      H.level = H.pending; H.lastRaiser = 'me'; H.called = true; H.pending = H.level + 1; render();
      say('Você aumentou: ' + CALLS[H.pending] + '!'); sfx(CALLS[H.pending].toLowerCase());
      later(aiRespond, 1000);
    } });
    var pen = H.pending;   // perder valendo isso custa $ (nível aceito)
    modal('O rival pediu ' + CALLS[H.pending] + '!',
      '<p>Aceitar deixa o Mult em <b>×' + stakeMult(H.pending) + '</b>. Se perder a mão, você paga <b>$' + pen + '</b>.</p>' +
      '<p>Correr: perde a mão, sem custo.</p>', btns);
  }


  // ============================================================================
  // DEMO NO MOSAICO "JOGAR" (mode-select.js)
  // A própria tela do Trutec (a de verdade) é encaixada, em miniatura, dentro do tile e um bot joga nela
  // clicando nos botões e nas cartas reais: truco, troca, loja, tudo. É como um vídeo do jogo ao vivo.
  // Sem som, sem salvar recorde. Ao escolher o tile (ou fechar o mosaico) a tela volta pro lugar.
  // ============================================================================
  var demoTimer = 0, demoHome = null, demoHost = null, demoLast = 0;
  var DLIKE = { zap: 9, manilheiro: 9, tres: 8, caradepau: 8, limpa: 7, ousadia: 6, virada: 6, maocheia: 7, sete: 7, maoextra: 9, baralho: 6, juros: 5, banqueiro: 6, moedeiro: 5, poupador: 5, coelho: 5 };

  function demoFit() {
    var s = $('screen-trutec');
    if (!s || !demoHost) return;
    var W = window.innerWidth, Hh = window.innerHeight, w = demoHost.clientWidth, h = demoHost.clientHeight;
    if (!w || !h) return;
    var k = Math.min(w / W, h / Hh);                       // cabe inteira no tile, com o mesmo tamanho que teria na tela cheia
    s.style.setProperty('--dw', W + 'px'); s.style.setProperty('--dh', Hh + 'px'); s.style.setProperty('--dk', k);
    s.style.setProperty('--dx', ((w - W * k) / 2) + 'px'); s.style.setProperty('--dy', ((h - Hh * k) / 2) + 'px');
  }
  function demoStart(host) {
    if (!host) return;
    build();
    if (DEMO) demoStop();
    var s = $('screen-trutec');
    demoHome = s.parentNode; demoHost = host; DEMO = true;
    if (window.TruCount) TruCount.silent = true;
    tok++; R = null; H = null; closeModal();
    ['tt-hand', 'tt-opphand', 'tt-vira', 'tt-slot-me', 'tt-slot-opp', 'tt-jokers'].forEach(function (id) { $(id).innerHTML = ''; });
    $('tt-truco').disabled = true; $('tt-run').disabled = true; $('tt-swap').disabled = true;
    setCalc(CHIPS0, 1, 1, 0); say('');
    host.appendChild(s); s.classList.add('active', 'tt-demo-screen');
    demoFit(); window.addEventListener('resize', demoFit);
    demoLast = Date.now();
    startRun();
    demoTimer = setInterval(demoTick, 350);
  }
  function demoStop() {
    if (!DEMO) return;
    DEMO = false; clearInterval(demoTimer); demoTimer = 0; window.removeEventListener('resize', demoFit);
    tok++; R = H = null; closeModal();
    var s = $('screen-trutec');
    if (s) {
      s.classList.remove('active', 'tt-demo-screen');
      ['--dw', '--dh', '--dk', '--dx', '--dy'].forEach(function (p) { s.style.removeProperty(p); });
      if (demoHome) demoHome.appendChild(s);
    }
    if (window.TruCount) TruCount.silent = false;
    demoHost = null;
  }

  // o bot: olha o estado real e aperta os botões reais (devagar, pra dar pra acompanhar)
  function demoTick() {
    if (!DEMO || !R) return;
    var now = Date.now(), ov = $('tt-overlay');
    if (!ov.classList.contains('hidden')) {                        // tem janela aberta
      var m = $('tt-modal'), title = (m.querySelector('h2') || {}).textContent || '';
      var byText = function (re) { return [].slice.call(m.querySelectorAll('.tt-mbtns .btn')).filter(function (b) { return re.test(b.textContent); })[0]; };
      var isShop = /^Loja/.test(title);
      if (now - demoLast < (isShop ? 1300 : 1900)) return;
      demoLast = now;
      var b;
      if (isShop) {                                                // loja: compra o melhor que dá, rola às vezes, segue
        var cards = [].slice.call(m.querySelectorAll('.tt-stall .tt-sc')), items = R.shop ? R.shop.items : [], bi = -1, bw = -1e9;
        items.forEach(function (it, i) {
          var bt = cards[i] && cards[i].querySelector('.tt-buy');
          if (!bt || bt.disabled) return;
          var wv = (DLIKE[it.id] || 3) * 10 - it.price;
          if (wv > bw) { bw = wv; bi = i; }
        });
        if (bi >= 0) return cards[bi].querySelector('.tt-buy').click();
        var rr = m.querySelector('.tt-reroll');
        if (rr && !rr.disabled && R.shop && R.shop.rerolls < 2 && Math.random() < 0.6) return rr.click();
        b = byText(/Próxima blind/); if (b) b.click();
        return;
      }
      if (/pediu/i.test(title) && H) {                             // o rival pediu truco: aceita, corre ou aumenta
        var e = est(H.me, H.results, 'me') + noise({ skill: 0.8 });
        if (e < 0.4 + 0.05 * H.pending) b = byText(/^Correr/);
        else if (e > 0.85 && H.pending < 4 && Math.random() < 0.4) b = byText(/^Pedir/);
        b = b || byText(/^Aceitar/);
        if (b) b.click();
        return;
      }
      b = byText(/^(Jogar|Ir à loja|Nova corrida)/);
      if (b) b.click();
      return;
    }
    if (!H || H.scoring || !H.canAct || now - demoLast < 750) return;   // espera a animação acabar e a vez dele
    demoLast = now;
    var weakest = function () { var wi = 0; H.me.forEach(function (c, i) { if (power(c) < power(H.me[wi])) wi = i; }); return wi; };
    var hand = $('tt-hand');
    if (H.swapMode) { if (hand.children[weakest()]) hand.children[weakest()].click(); return; }
    H.dSw = H.dSw || 0;
    if (canSwap() && H.dSw < 2 && est(H.me, [], 'me') < 0.5) { H.dSw++; $('tt-swap').click(); return; }
    if (H.level < 4 && H.lastRaiser !== 'me' && !$('tt-truco').disabled) {
      var em = est(H.me, H.results, 'me') + noise({ skill: 0.75 });
      if (Math.random() < (em > 0.68 ? 0.45 : 0.04)) { $('tt-truco').click(); return; }
    }
    var order = H.me.map(function (c, i) { return i; }).sort(function (a, b2) { return power(H.me[a]) - power(H.me[b2]); }), pick;
    if (H.table.opp) {
      var op = power(H.table.opp), beat = order.filter(function (i) { return power(H.me[i]) > op; });
      pick = beat.length ? beat[0] : order[0];                     // cobre com a menor que ganha; senão descarta a menor
    } else if (!H.results.length && order.length === 3) pick = Math.random() < 0.5 ? order[2] : order[1];
    else pick = order[order.length - 1];
    if (hand.children[pick]) hand.children[pick].click();
  }

  // ---------- ligação com o lobby ----------
  function init() {
    var b = $('btn-open-trutec');
    if (b) b.addEventListener('click', open);
    window.Trutec = { open: open, demoStart: demoStart, demoStop: demoStop };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
