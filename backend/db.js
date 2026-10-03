// ============================================================================
// BANCO DE DADOS (Supabase) — contas Google, @ e vitórias/derrotas
// Variáveis no Render: SUPABASE_URL e SUPABASE_SERVICE_KEY (chave service_role,
// NUNCA vai pro frontend). Sem elas, o jogo funciona normal só sem contas.
// ============================================================================
const { createClient } = require('@supabase/supabase-js');

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const enabled = !!(URL && KEY);
const sb = enabled ? createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } }) : null;

const HANDLE_RE = /^[a-z0-9_]{3,16}$/;
const RESERVED = new Set(['admin', 'administrador', 'adm', 'mod', 'moderador', 'suporte', 'support', 'truco', 'trutec',
  'trutecc', 'oficial', 'official', 'sistema', 'system', 'root', 'null', 'undefined', 'api', 'perfil', 'bot', 'jogador']);

function normHandle(h) { return String(h || '').trim().replace(/^@/, '').toLowerCase(); }
function checkHandle(h) {
  if (!HANDLE_RE.test(h)) return 'Use de 3 a 16 caracteres: letras minúsculas, números e _.';
  if (RESERVED.has(h)) return 'Esse @ é reservado. Escolha outro.';
  return null;
}

// display_name / bio: colunas novas (veja o SQL em supabase-perfil.sql). Se ainda não existirem
// no banco, o servidor cai pras colunas antigas em vez de quebrar o login.
const BASE_COLS = 'id, handle, wins, losses, character, theme, created_at';
const FULL_COLS = BASE_COLS + ', display_name, bio';
let COLS = FULL_COLS;
const missingCol = (e) => !!e && (e.code === '42703' || /display_name|bio|column/i.test(e.message || ''));
async function withCols(run) {
  let r = await run(COLS);
  if (r.error && COLS === FULL_COLS && missingCol(r.error)) {
    console.warn('[db] colunas display_name/bio não existem ainda; rode supabase-perfil.sql');
    COLS = BASE_COLS;
    r = await run(COLS);
  }
  return r;
}
const pub = (r) => r && ({
  id: r.id, handle: r.handle, wins: r.wins, losses: r.losses, character: r.character || null, theme: r.theme || null,
  displayName: r.display_name || null, bio: r.bio || null, createdAt: r.created_at
});

// Limpa texto de perfil: sem caracteres de controle nem os que invertem a direção do texto.
function cleanText(v, max, multiline) {
  let s = String(v == null ? '' : v).replace(/\r/g, '');
  s = s.replace(/[\u0000-\u0008\u000B-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g, '');
  if (multiline) s = s.replace(/\n{3,}/g, '\n\n');
  else s = s.replace(/\s+/g, ' ');
  return s.trim().slice(0, max);
}

// token do Supabase -> usuário (cache curto pra não consultar a cada evento)
const tokenCache = new Map();
async function verify(token) {
  if (!enabled || typeof token !== 'string' || token.length < 20 || token.length > 4000) return null;
  const hit = tokenCache.get(token);
  if (hit && hit.exp > Date.now()) return hit.user;
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data || !data.user) return null;
  const user = { id: data.user.id };
  tokenCache.set(token, { user, exp: Date.now() + 60000 });
  if (tokenCache.size > 2000) tokenCache.clear();
  return user;
}

async function byId(id) {
  const { data } = await withCols((c) => sb.from('profiles').select(c).eq('id', id).maybeSingle());
  return pub(data);
}
async function byHandle(handle) {
  const { data } = await withCols((c) => sb.from('profiles').select(c).eq('handle', handle).maybeSingle());
  return pub(data);
}
async function create(userId, handle) {
  const { data, error } = await withCols((c) => sb.from('profiles').insert({ id: userId, handle }).select(c).single());
  if (error) {
    if (error.code === '23505') {
      const mine = await byId(userId);
      return { error: mine ? 'Você já tem um perfil.' : 'Esse @ já está em uso.' };
    }
    throw error;
  }
  return { profile: pub(data) };
}
async function setCharacter(userId, character) {
  await sb.from('profiles').update({ character }).eq('id', userId);
}
async function setProfileInfo(userId, displayName, bio) {
  const { error } = await sb.from('profiles').update({ display_name: displayName, bio: bio || null }).eq('id', userId);
  if (error) throw error;
}
async function recordResult(userId, win) {
  const { error } = await sb.rpc('record_result', { p_user: userId, p_win: !!win });
  if (error) throw error;
}

module.exports = { enabled, verify, byId, byHandle, create, setCharacter, setProfileInfo, cleanText, recordResult, normHandle, checkHandle };
