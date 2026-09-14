// =============================================================================
//  ACESSO AO PAINEL — cadastro, login e sessão.
//
//  O DESENHO EM UMA FRASE: qualquer pessoa pode pedir acesso, ninguém entra
//  antes de um administrador liberar, e cada conta tem um papel que decide se
//  ela só olha ou também mexe.
//
//  O CAMINHO DE UMA CONTA
//    1. a pessoa se cadastra em /cadastro  ->  nasce PENDENTE e LEITOR;
//    2. o login de quem está PENDENTE não abre sessão nenhuma — devolve 403 e
//       a tela manda para /aguardando-aprovacao;
//    3. um SUPER_ADMIN libera em /admin/usuarios, escolhendo papel e setor;
//    4. a partir daí o login abre sessão normalmente.
//
//  Repare que o passo 2 não cria sessão: uma sessão "pela metade" seria uma
//  chave meia-volta na fechadura, e alguém acabaria esquecendo de conferir o
//  status em alguma rota. Sem cookie, não há o que esquecer.
//
//  COMO A SESSÃO FUNCIONA
//    * o login devolve um cookie com { id, email, validade } assinado em
//      HMAC-SHA256 — mexer em qualquer byte invalida a assinatura;
//    * nada é guardado no banco: o cookie assinado é a própria sessão;
//    * MAS o papel e o status NÃO vão no cookie. Eles são lidos do banco a
//      cada requisição. É o que faz "bloquear usuário" surtir efeito na hora,
//      em vez de valer só quando o cookie de 30 dias vencer.
//
//  O cookie é HttpOnly (o JavaScript da página não o lê, o que protege contra
//  roubo por script injetado), Secure (só viaja por HTTPS) e SameSite=Lax
//  (não é enviado em requisição vinda de outro site).
//
//  POR QUE A SENHA É CONFERIDA AQUI, E NÃO NO NAVEGADOR: senha conferida no
//  navegador é senha publicada — qualquer pessoa abre o código da página e lê.
//  E, pior, bastaria chamar /api/emendas direto para ver tudo sem passar pela
//  tela de login. Então a conferência é aqui, e o roteador recusa qualquer
//  chamada à API sem sessão válida.
//
//  ---------------------------------------------------------------------------
//  ANTES DE PUBLICAR, defina a chave que assina as sessões:
//
//    npx wrangler secret put PAINEL_SEGREDO
//
//  Sem ela vale o texto de reserva abaixo, que está no repositório — quem tiver
//  o código consegue forjar um cookie. Em produção, defina o segredo.
// =============================================================================

import { erro, json, type Env } from './db';

/** Papéis, do mais poderoso para o mais restrito. */
export const PAPEIS = ['SUPER_ADMIN', 'OPERADOR', 'LEITOR'] as const;
export type Papel = (typeof PAPEIS)[number];

export const STATUS_USUARIO = ['PENDENTE', 'ATIVO', 'BLOQUEADO'] as const;
export type StatusUsuario = (typeof STATUS_USUARIO)[number];

/** Mensagens que a tela mostra tal e qual — ficam juntas para não divergirem. */
export const MENSAGENS = {
  credenciais: 'E-mail ou senha incorretos.',
  pendente:
    'Sua conta foi criada com sucesso! Aguarde a liberação do Administrador Geral ' +
    'para acessar o sistema.',
  bloqueado: 'Acesso suspenso. Entre em contato com a administração.',
  semSessao: 'Sessão expirada. Entre novamente para continuar.',
  semPermissao: 'Seu perfil de acesso não permite esta ação.',
} as const;

const NOME_COOKIE = 'painel_sessao';
/** Com "manter conectado": 30 dias. Sem: o cookie morre ao fechar o navegador. */
const DIAS_LEMBRADO = 30;
/** Sem "manter conectado", a sessão ainda expira sozinha depois disso. */
const HORAS_SESSAO = 12;

/**
 * Repetições do PBKDF2 em senhas novas. Hashes antigos guardam o próprio.
 * O runtime do Cloudflare Workers recusa `crypto.subtle.deriveBits` acima de
 * 100.000 repetições (`NotSupportedError`) — diferente de Node e do navegador,
 * que aceitam bem mais. 100.000 é o teto, não uma escolha de segurança.
 */
const ITERACOES = 100_000;
/** Tamanho mínimo da senha no cadastro. */
export const MINIMO_SENHA = 8;

const cod = new TextEncoder();

// -----------------------------------------------------------------------------
// Ferramentas de baixo nível
// -----------------------------------------------------------------------------

const paraBase64Url = (bytes: ArrayBuffer | Uint8Array): string => {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const hex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Comparação de tempo constante. Comparar com === vaza informação pelo tempo
 * de resposta: quanto mais caracteres iniciais acertados, mais demora — e isso
 * permite descobrir um segredo caractere a caractere.
 */
function iguaisEmTempoConstante(a: string, b: string): boolean {
  const ba = cod.encode(a);
  const bb = cod.encode(b);
  // O tamanho não é segredo, mas a comparação continua percorrendo tudo.
  let diferenca = ba.length ^ bb.length;
  const maior = Math.max(ba.length, bb.length);
  for (let i = 0; i < maior; i++) {
    diferenca |= (ba[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diferenca === 0;
}

async function derivar(senha: string, sal: string, iteracoes: number): Promise<string> {
  const material = await crypto.subtle.importKey('raw', cod.encode(senha), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: cod.encode(sal), iterations: iteracoes },
    material,
    256,
  );
  return hex(bits);
}

/**
 * Transforma a senha no que vai para o banco:
 *   pbkdf2$sha256$<repetições>$<sal>$<hash>
 *
 * O sal é sorteado por usuário. Sem ele, duas pessoas com a mesma senha teriam
 * o mesmo hash — e quem visse a tabela descobriria isso de olho, além de poder
 * quebrar as duas de uma vez com uma tabela pronta.
 */
export async function gerarHashDeSenha(senha: string): Promise<string> {
  const sal = hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  const hash = await derivar(senha, sal, ITERACOES);
  return `pbkdf2$sha256$${ITERACOES}$${sal}$${hash}`;
}

/**
 * Confere a senha digitada contra o que está guardado.
 * Guardado vazio quer dizer "conta sem senha" (servidor que só aparece como
 * responsável de processo): nunca confere, nem com senha vazia.
 */
export async function conferirSenha(senha: string, guardado: string): Promise<boolean> {
  if (!guardado || !senha) return false;
  const partes = guardado.split('$');
  if (partes.length !== 5 || partes[0] !== 'pbkdf2' || partes[1] !== 'sha256') return false;

  const iteracoes = Number(partes[2]);
  if (!Number.isInteger(iteracoes) || iteracoes < 1000 || iteracoes > 1_000_000) return false;

  const calculado = await derivar(senha, partes[3], iteracoes);
  return iguaisEmTempoConstante(calculado, partes[4]);
}

/**
 * Gasta o mesmo tempo de uma conferência de verdade, para quando o e-mail nem
 * existe. Sem isso, o login responde na hora para e-mail desconhecido e devagar
 * para e-mail conhecido — e essa diferença entrega quem tem conta.
 */
async function fingirConferencia(senha: string): Promise<void> {
  await derivar(senha || 'x', '00000000000000000000000000000000', ITERACOES);
}

/** Chave de assinatura da sessão. */
async function chaveDeAssinatura(env: Env): Promise<CryptoKey> {
  const segredo = env.PAINEL_SEGREDO ?? 'painel-smcasp-assinatura-de-reserva';
  return crypto.subtle.importKey(
    'raw',
    cod.encode(segredo),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function assinar(env: Env, texto: string): Promise<string> {
  const chave = await chaveDeAssinatura(env);
  return paraBase64Url(await crypto.subtle.sign('HMAC', chave, cod.encode(texto)));
}

// -----------------------------------------------------------------------------
// Sessão
// -----------------------------------------------------------------------------

/** O que viaja dentro do cookie. Papel e status ficam de fora de propósito. */
interface Cracha {
  id: number;
  email: string;
  /** Momento em que a sessão deixa de valer, em milissegundos. */
  validade: number;
}

/** O que a API sabe sobre quem está do outro lado, lido do banco a cada vez. */
export interface UsuarioSessao {
  id: number;
  nome: string;
  email: string;
  role: Papel;
  status: StatusUsuario;
  id_setor: number | null;
  setor_sigla: string | null;
}

const SELECT_USUARIO = `
  SELECT u.id, u.nome, u.email, u.role, u.status, u.id_setor, s.sigla AS setor_sigla
  FROM usuarios u
  LEFT JOIN setores s ON s.id = u.id_setor`;

async function criarToken(env: Env, cracha: Cracha): Promise<string> {
  const corpo = paraBase64Url(cod.encode(JSON.stringify(cracha)));
  return `${corpo}.${await assinar(env, corpo)}`;
}

/** Devolve o crachá quando o token é autêntico e não expirou; senão, nulo. */
async function lerToken(env: Env, token: string): Promise<Cracha | null> {
  const [corpo, assinatura] = token.split('.');
  if (!corpo || !assinatura) return null;
  if (!iguaisEmTempoConstante(assinatura, await assinar(env, corpo))) return null;

  try {
    const dados = JSON.parse(atob(corpo.replace(/-/g, '+').replace(/_/g, '/'))) as Cracha;
    if (!Number.isInteger(dados?.id) || typeof dados.validade !== 'number') return null;
    if (Date.now() > dados.validade) return null;
    return dados;
  } catch {
    return null;
  }
}

function lerCookie(request: Request, nome: string): string | null {
  const bruto = request.headers.get('cookie');
  if (!bruto) return null;
  for (const parte of bruto.split(';')) {
    const [chave, ...resto] = parte.trim().split('=');
    if (chave === nome) return resto.join('=');
  }
  return null;
}

function montarCookie(valor: string, segundos: number | null): string {
  const partes = [`${NOME_COOKIE}=${valor}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Secure'];
  // Sem Max-Age o cookie é "de sessão": o navegador o descarta ao fechar.
  if (segundos !== null) partes.push(`Max-Age=${segundos}`);
  return partes.join('; ');
}

/**
 * Quem está do outro lado, ou nulo. Só devolve conta ATIVA: se o administrador
 * bloqueou a pessoa há um minuto, o cookie que ela tem na mão deixa de servir
 * agora, não daqui a trinta dias.
 */
export async function sessaoDaRequisicao(
  request: Request,
  env: Env,
): Promise<UsuarioSessao | null> {
  const token = lerCookie(request, NOME_COOKIE);
  if (!token) return null;

  const cracha = await lerToken(env, token);
  if (!cracha) return null;

  const usuario = await env.DB.prepare(`${SELECT_USUARIO} WHERE u.id = ?`)
    .bind(cracha.id)
    .first<UsuarioSessao>();

  if (!usuario || usuario.status !== 'ATIVO') return null;
  // O e-mail no crachá tem que bater com o do banco: se a conta foi excluída e
  // o id reaproveitado por outra pessoa, o cookie antigo não vale para ela.
  if (usuario.email.toLowerCase() !== String(cracha.email).toLowerCase()) return null;

  return usuario;
}

// -----------------------------------------------------------------------------
// Rotas de /api/sessao — entrar, sair, saber quem está conectado
// -----------------------------------------------------------------------------

export async function tratarSessao(request: Request, env: Env): Promise<Response> {
  // Quem está conectado? A tela usa isto ao abrir, para decidir entre mostrar
  // o login ou o painel.
  if (request.method === 'GET') {
    const usuario = await sessaoDaRequisicao(request, env);
    return json(usuario ? { autenticado: true, usuario } : { autenticado: false });
  }

  // Sair: manda o navegador apagar o cookie.
  if (request.method === 'DELETE') {
    const resposta = json({ ok: true });
    resposta.headers.set('set-cookie', montarCookie('', 0));
    return resposta;
  }

  if (request.method !== 'POST') return erro('Método não permitido.', 405);

  let corpo: { email?: unknown; senha?: unknown; manter?: unknown };
  try {
    corpo = (await request.json()) as typeof corpo;
  } catch {
    return erro('Não foi possível ler os dados enviados.', 400);
  }

  const email = String(corpo.email ?? '').trim().toLowerCase();
  const senha = String(corpo.senha ?? '');
  const manter = corpo.manter === true;

  const conta = await env.DB.prepare(
    `SELECT id, email, senha_hash, status FROM usuarios WHERE lower(email) = ?`,
  )
    .bind(email)
    .first<{ id: number; email: string; senha_hash: string; status: StatusUsuario }>();

  if (!conta) {
    await fingirConferencia(senha);
    // Mensagem única de propósito: dizer "senha errada" confirmaria que o
    // e-mail existe, e uma lista de e-mails válidos já é meio caminho.
    return erro(MENSAGENS.credenciais, 401);
  }

  if (!(await conferirSenha(senha, conta.senha_hash))) {
    return erro(MENSAGENS.credenciais, 401);
  }

  // Senha certa, mas a conta ainda não passou pelo administrador. Repare que a
  // situação só é revelada DEPOIS de a senha conferir — quem chuta e-mails
  // alheios continua recebendo "e-mail ou senha incorretos".
  if (conta.status === 'PENDENTE') {
    return json({ erro: MENSAGENS.pendente, situacao: 'PENDENTE' }, 403);
  }
  if (conta.status === 'BLOQUEADO') {
    return json({ erro: MENSAGENS.bloqueado, situacao: 'BLOQUEADO' }, 403);
  }

  const segundos = manter ? DIAS_LEMBRADO * 24 * 3600 : HORAS_SESSAO * 3600;
  const token = await criarToken(env, {
    id: conta.id,
    email: conta.email,
    validade: Date.now() + segundos * 1000,
  });

  const usuario = await env.DB.prepare(`${SELECT_USUARIO} WHERE u.id = ?`)
    .bind(conta.id)
    .first<UsuarioSessao>();

  const resposta = json({ autenticado: true, usuario });
  resposta.headers.set('set-cookie', montarCookie(token, manter ? segundos : null));
  return resposta;
}

// -----------------------------------------------------------------------------
// Rotas de /api/cadastro — pedir acesso
// -----------------------------------------------------------------------------

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Regras da senha, escritas em uma frase para que a tela possa repetir a mesma
 * exigência antes de enviar. Deliberadamente modestas: exigir símbolo, número e
 * maiúscula empurra as pessoas para o papel colado no monitor.
 */
export const REGRA_SENHA = `A senha precisa ter ao menos ${MINIMO_SENHA} caracteres.`;

export async function tratarCadastro(request: Request, env: Env): Promise<Response> {
  // A tela de cadastro precisa da lista de setores, e quem ainda não tem conta
  // não pode chamar /api/setores. Esta é a única informação que sai sem sessão.
  if (request.method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT id, nome, sigla, grupo FROM setores
        ORDER BY CASE grupo WHEN 'SMCASP' THEN 0 ELSE 1 END, nome COLLATE NOCASE`,
    ).all();
    return json({ setores: results });
  }

  if (request.method !== 'POST') return erro('Método não permitido.', 405);

  let corpo: Record<string, unknown>;
  try {
    corpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return erro('Não foi possível ler os dados enviados.', 400);
  }

  const nome = String(corpo.nome ?? '').trim();
  const email = String(corpo.email ?? '').trim().toLowerCase();
  const senha = String(corpo.senha ?? '');
  const idSetor = corpo.id_setor === '' || corpo.id_setor == null ? null : Number(corpo.id_setor);

  if (nome.length < 3) return erro('Escreva seu nome completo.', 422);
  if (nome.length > 120) return erro('O nome é longo demais.', 422);
  if (!RE_EMAIL.test(email)) return erro('Escreva um e-mail válido.', 422);
  if (email.length > 160) return erro('O e-mail é longo demais.', 422);
  if (senha.length < MINIMO_SENHA) return erro(REGRA_SENHA, 422);
  if (senha.length > 200) return erro('A senha é longa demais.', 422);
  if (idSetor !== null && !Number.isInteger(idSetor)) return erro('Escolha um setor da lista.', 422);
  if (idSetor === null) return erro('Escolha o seu setor.', 422);

  const setor = await env.DB.prepare(`SELECT id FROM setores WHERE id = ?`).bind(idSetor).first();
  if (!setor) return erro('Escolha um setor da lista.', 422);

  const jaExiste = await env.DB.prepare(
    `SELECT id, senha_hash FROM usuarios WHERE lower(email) = ?`,
  )
    .bind(email)
    .first<{ id: number; senha_hash: string }>();

  // Um servidor que já está na tabela só como responsável de processo (sem
  // senha) pode pedir acesso: em vez de recusar por e-mail repetido, o cadastro
  // completa a ficha que já existe e a manda para a fila de aprovação.
  if (jaExiste && !jaExiste.senha_hash) {
    await env.DB.prepare(
      `UPDATE usuarios
          SET nome = ?, senha_hash = ?, role = 'LEITOR', status = 'PENDENTE', id_setor = ?
        WHERE id = ?`,
    )
      .bind(nome, await gerarHashDeSenha(senha), idSetor, jaExiste.id)
      .run();
    return json({ ok: true, situacao: 'PENDENTE', mensagem: MENSAGENS.pendente }, 201);
  }

  if (jaExiste) {
    return erro(
      'Já existe um cadastro com esse e-mail. Se for seu, entre com a sua senha; ' +
        'se esqueceu, procure o administrador.',
      409,
    );
  }

  // status e role são forçados aqui, e não vêm do corpo da requisição: se
  // viessem, bastaria mandar {"role":"SUPER_ADMIN"} no cadastro para virar
  // administrador sem passar por ninguém.
  await env.DB.prepare(
    `INSERT INTO usuarios (nome, email, senha_hash, role, status, id_setor)
     VALUES (?, ?, ?, 'LEITOR', 'PENDENTE', ?)`,
  )
    .bind(nome, email, await gerarHashDeSenha(senha), idSetor)
    .run();

  return json({ ok: true, situacao: 'PENDENTE', mensagem: MENSAGENS.pendente }, 201);
}
