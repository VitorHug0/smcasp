# Painel da Secretaria — controle interno

Aplicação web para acompanhar **contratos, emendas, processos e aquisições** de uma
Secretaria, feita para ser usada por quem não é da área de tecnologia.

Roda inteira na Cloudflare: front-end estático + Worker + banco **D1** (SQLite serverless).
Sem servidor para manter, sem custo fixo.

---

## Como está organizado

```
secretaria-controle/
├── migrations/
│   ├── 0001_schema.sql        estrutura das tabelas, índices e trigger
│   ├── 0002_seed.sql          dados reais + a conta do Administrador Geral
│   └── 0003_acesso.sql        controle de acesso em banco já publicado
├── worker/
│   ├── index.ts               entrada: /api/* → API, resto → front-end
│   ├── auth.ts                cadastro, login, sessão assinada e senhas
│   ├── admin.ts               gestão de contas (só Administrador Geral)
│   ├── router.ts              rotas REST, trava por perfil e dashboard
│   ├── recursos.ts            colunas, validação e SELECTs de cada recurso
│   └── db.ts                  respostas JSON, validação, SQL parametrizado
├── functions/api/[[path]].ts  adaptador opcional para Cloudflare Pages
├── src/
│   ├── App.tsx                sessão, endereços das telas, layout e menu
│   ├── modules/               VisaoGeral · Processos · Concluidos · Compras
│   │                          Contratos · Emendas · Usuarios
│   │                          Login · Cadastro · AguardandoAprovacao
│   ├── components/            MenuLateral, MolduraDeAcesso, CartaoKpi, Avatar
│   │                          e componentes de UI
│   ├── hooks/useDados.ts      carregamento com estado de erro e "carregando"
│   └── lib/                   api.ts (cliente HTTP), permissoes.tsx (quem pode
│                              o quê), rotas.ts (endereços), formato.ts,
│                              setores.ts e types.ts
├── wrangler.jsonc             configuração do Worker + binding do D1
└── index.html / vite.config.ts / tsconfig*.json
```

Os tipos em `src/lib/types.ts` são usados **pelos dois lados** — se a API mudar um
campo, o TypeScript acusa na tela que consome.

---

## Publicar (5 passos)

```bash
npm install

npx wrangler login
npx wrangler d1 create secretaria-db     # copie o database_id que aparecer
#    ↳ cole esse id em wrangler.jsonc, campo "database_id"

npm run db:remote                         # cria as tabelas e os dados de exemplo
npm run deploy                            # build + publicação
```

Pronto: o Wrangler devolve a URL `https://secretaria-controle.<sua-conta>.workers.dev`.

> Para publicar como **Cloudflare Pages** em vez de Workers: mantenha a pasta
> `functions/`, rode `npm run build` e depois `npx wrangler pages deploy dist`,
> criando o binding D1 chamado `DB` em *Settings → Functions → D1 database bindings*.
> Se for de Workers, a pasta `functions/` pode ser apagada.

## Rodar na sua máquina

```bash
npm install
npm run db:local        # cria o banco local em .wrangler/
npm run build
npx wrangler dev        # http://localhost:8787 — front-end e API juntos
```

Para desenvolver o front-end com recarga automática, deixe o `npx wrangler dev`
rodando e abra outro terminal com `npm run dev` (o Vite encaminha `/api` para a
porta 8787).

---

## Acesso

Cada pessoa tem a sua conta, e **ninguém entra sem passar pelo Administrador
Geral**. O caminho é sempre o mesmo:

1. a pessoa abre `/cadastro`, informa nome, e-mail institucional, setor e senha;
2. o cadastro nasce **aguardando liberação** e **somente consulta** — tentar
   entrar leva à tela `/aguardando-aprovacao`, não ao painel;
3. o Administrador Geral vê o pedido em `/admin/usuarios`, escolhe o perfil e o
   setor, e libera;
4. a partir daí a pessoa entra com o mesmo e-mail e a mesma senha.

O passo 2 é o ponto: **nenhuma sessão é aberta** para quem está na fila. Uma
sessão "pela metade" seria uma chave meia-volta na fechadura, e alguém acabaria
esquecendo de conferir a situação em alguma rota. Sem cookie, não há o que
esquecer.

### Os três perfis

| Perfil | O que faz |
|---|---|
| **Administrador Geral** | Tudo, mais a tela de usuários: libera, recusa, bloqueia, muda perfil e setor, define senha. |
| **Operador** | Consulta tudo e lança/corrige processos, contratos, emendas e compras. |
| **Leitor** | Só consulta. Nenhum botão de cadastrar, editar ou excluir aparece — e, se aparecesse, a API recusaria. |

Quem define o perfil é sempre o administrador, na hora de liberar. O formulário
de cadastro **não** aceita escolher perfil: se aceitasse, bastaria alterar o que
o navegador envia para virar administrador sem passar por ninguém.

Três travas existem para ninguém se trancar do lado de fora: o administrador não
muda o próprio perfil, não bloqueia nem apaga a própria conta, e o **último**
Administrador Geral ativo não pode ser rebaixado, bloqueado nem apagado.

### A primeira conta

O banco já vem com uma conta de Administrador Geral —
`da.smcasp@campinas.sp.gov.br`, com a senha que combinamos. Sem ela não haveria
como aprovar o primeiro cadastro: o sistema ficaria trancado por fora, com a
fila de pendentes e ninguém para atendê-la.

> **Troque essa senha assim que publicar.** Entre com ela, abra **Usuários**,
> clique na chave ao lado da própria conta e defina outra. A senha do arquivo
> deixa de valer na hora.

Os seis servidores que já apareciam como responsáveis de processo (Rafael,
Simone, Ana Letícia, Daniel, Vitor e Waldir) continuam lá, **sem senha**: eles
figuram nas listas de responsável, mas não entram no sistema. Para dar acesso a
um deles, o caminho é o de todo mundo — a pessoa se cadastra e o administrador
libera. A tela de usuários marca essas contas com "Sem senha".

### "Manter conectado neste computador"

| Caixa | O que acontece |
|---|---|
| marcada | a sessão dura **30 dias**, mesmo fechando o navegador |
| desmarcada | a sessão vale por **12 horas** e o navegador a descarta ao fechar |

### Como a conferência é feita — e por que não no navegador

A senha é conferida **no servidor** (`worker/auth.ts`). Senha conferida no
JavaScript da página é senha publicada: qualquer pessoa abre o código-fonte e a
lê. Pior: sem trava no servidor, bastaria abrir `/api/contratos` no navegador
para ver tudo sem passar pelo login. Por isso o roteador recusa **qualquer**
chamada à API sem sessão válida, e recusa a escrita de quem tem perfil de
Leitor.

As senhas ficam no banco como **hash PBKDF2-SHA256** (100.000 repetições — o teto que
o runtime do Cloudflare Workers aceita para `crypto.subtle.deriveBits`, não uma escolha
de segurança — com sal sorteado por usuário), nunca em texto puro. O sal por usuário importa: sem
ele, duas pessoas com a mesma senha teriam o mesmo hash — e quem visse a tabela
descobriria isso de olho, além de poder quebrar as duas de uma vez.

A sessão é um cookie assinado em HMAC-SHA256 com `{ id, e-mail, validade }`
dentro. Nada é guardado no banco: qualquer alteração no cookie invalida a
assinatura. O cookie é `HttpOnly` (o JavaScript da página não o lê, o que
protege contra roubo por script injetado), `Secure` (só viaja por HTTPS) e
`SameSite=Lax` (não é enviado em requisições vindas de outro site).

**O perfil e a situação não vão no cookie.** São lidos do banco a cada
requisição. É o que faz "bloquear usuário" surtir efeito na hora, em vez de
valer só quando o cookie de 30 dias vencer — bloqueie alguém e a pessoa perde o
acesso no próximo clique, mesmo com o painel aberto.

### Logo depois de publicar, defina o segredo da sessão

```bash
npx wrangler secret put PAINEL_SEGREDO    # chave que assina o cookie de sessão
```

**Depois do primeiro `npm run deploy`, não antes**: o comando precisa que o
Worker já exista na sua conta. O segredo passa a valer na hora, sem publicar de
novo.

Sem ele vale um texto de reserva que está no repositório — quem tiver o código
consegue forjar um cookie. As contas e as senhas ficam na tabela `usuarios`, não
em variáveis de ambiente.

> Trocar o segredo depois derruba todas as sessões abertas, e todo mundo precisa
> entrar de novo. É o que se faz se um computador for perdido ou roubado.

### Se o banco já está no ar

O `0001_schema.sql` recria a tabela `usuarios` na forma nova, o que apaga os
dados. Para acrescentar o controle de acesso a um banco que já está publicado
**sem perder nada**, rode só a migração 3:

```bash
npx wrangler d1 execute secretaria-db --remote --file=./migrations/0003_acesso.sql
```

Ela acrescenta as três colunas (`senha_hash`, `role`, `status`), marca quem já
estava cadastrado como ativo e cria a conta do Administrador Geral.

## O que cada tela faz

| Tela | O que resolve |
|---|---|
| **Visão geral** | 4 números do ano (previsto em contratos e quanto já está empenhado, saldo de emendas, processos em aberto, compras), gráfico de saldo disponível × comprometido **por objetivo da emenda** e a lista dos contratos que vencem em até 90 dias. **Tudo aqui é ponto de partida**: cada cartão abre a tela do assunto, cada coluna do gráfico abre as emendas daquele objetivo, e cada contrato da lista abre os contratos já procurando a empresa. |
| **Processos** | A planilha de controle, com os processos em linhas e faixas escuras separando as fases — *CSA, CSF, Acompanhamento, Execução/Entrega, AUDESP/PNCP e Outros*. Colunas: SEI, objeto, modalidade, emenda, AUDESP, PNCP, status, prioridade e os dois responsáveis. **Tudo se edita no lugar, sem abrir janela**, e o SEI se copia com um clique. A coluna *Mover para* leva o processo a outra fase ou o conclui. O botão de lápis abre a ficha completa, de onde também se **apaga** o processo. Busca e filtros por responsável e prioridade no topo, e **Exportar Excel** para levar a lista embora (ver abaixo). |
| **Concluídos** | O histórico em linhas, como planilha: SEI, objeto, modalidade, **AUDESP, PNCP**, setor, responsável, prazo e data de conclusão — os três números se copiam com um clique. Ordena por qualquer coluna, busca por SEI, objeto, AUDESP, PNCP, responsável ou setor, filtra por setor e por modalidade, e marca quem entregou no prazo. O botão de lápis abre a **ficha completa**, a mesma do quadro: mostra o que a linha não cabe (emenda, 2º responsável, anotação de status), deixa corrigir qualquer campo e **apagar** o processo. Reabrir pode ser feito pela coluna *Reabrir* ou trocando a fase dentro da ficha. |
| **Compras** | Tabela buscável com item, quantidade, valor, setor que recebeu e contrato de origem. Cadastro em janela. |
| **Contratos** | Duas visões da mesma lista, como as duas planilhas da Coordenadoria. **Vigência e renovação**: uma ficha por contrato com o SEI copiável, término e vigência restante, data do 1º contrato, duração, data-base de reajuste, nº do último ajuste, gestor, fiscal e a decisão de renovação (*Renovar, Licitar, Dispensa, A definir*); busca por SEI, empresa, número, gestor ou fiscal e filtro por interesse em renovar. **Pagamentos do ano**: a planilha de valores com os doze meses, TOTAL, faturas futuras, empenho, reservado, SME e saldo, **tudo editável no lugar**, com linha de totais no rodapé. |
| **Emendas** | Espelha a planilha "Emendas Impositivas": uma ficha por emenda com o vereador, o **objetivo**, a natureza da despesa, a finalidade escrita por extenso e o processo copiável. O dinheiro aparece nas quatro colunas da planilha — valor, a liquidar, liquidado e saldo — com os totais no topo e filtro por objetivo. |
| **Usuários** *(só Administrador Geral)* | Duas listas. Em cima, **aprovações pendentes**, com contagem no título — uma fila que não se vê é uma fila que não anda; "Aprovar" abre a janela que define perfil e setor de uma vez. Embaixo, as **contas cadastradas**: perfil e setor mudam direto na linha, e os botões ao lado definem senha, bloqueiam, reativam ou apagam. |

### Setores

Os setores estão cadastrados em **dois grupos**, e é assim que aparecem em toda lista de
seleção e filtro do sistema:

| Grupo | Setores |
|---|---|
| **SMCASP** | CICC · MATBEL · Gabinete · Logística · RH · Corregedoria · DA · Estatística · Comando · Porte |
| **Guarda Municipal** | Base Norte · Base Sul · Base Leste · Base Oeste · Base Centro · Academia · SAE |

Dentro de cada grupo a ordem é alfabética — com 17 opções, achar pelo nome é o que
importa. O `grupo` é texto livre na tabela `setores`: para criar um terceiro grupo mais
tarde, basta cadastrar setores com outro valor ali; nenhuma tela precisa mudar.

### Campos do processo

| Campo | O que é |
|---|---|
| **SEI** | número do processo, ex.: `PMC.2026.00130127-81` |
| **Objeto** | o que está sendo contratado, ex.: `Caixas Herméticas` — é o nome do processo nas telas |
| **Modalidade** | AMIL · CREDENCIAMENTO · ARP · Adesão ARP · Reajuste · LICITAÇÃO · PRORROGAÇÃO · INEX |
| **Emenda** | sim ou não — se a contratação usa recurso de emenda |
| **Status** | texto livre do que está sendo feito agora; escrito no cadastro e reescrito no cartão a qualquer momento |
| **AUDESP** | número de registro no AUDESP |
| **PNCP** | número de registro no PNCP |
| **Prioridade** | Baixa · Média · Alta · Muito Alta |
| **Responsável** e **2º responsável** | as duas colunas "Responsável" da planilha |
| **Setor** | de quem é o processo (lista agrupada por SMCASP / Guarda Municipal) |
| **Data limite** | vira alerta colorido no cartão quando o prazo aperta |

Só o **objeto** é obrigatório — o resto pode ficar em branco e ser completado depois.

### Campos do contrato

As duas planilhas de controle da Coordenadoria se ligam pelo **número do SEI**, e é
assim que o sistema as junta: cada contrato tem os campos das duas, e fica sem os da
planilha em que não aparece.

| Campo | Vem de | O que é |
|---|---|---|
| **SEI** | as duas | número do processo — é o que liga as duas planilhas |
| **Empresa** | as duas | quem fornece; único campo obrigatório |
| **Objeto** | — | o que a empresa fornece |
| **Nº do contrato** | vigência | ex.: `265/23`; em branco quando ainda não há contrato assinado |
| **Nº do último ajuste** | vigência | termo de prorrogação/ajuste mais recente |
| **Data do 1º contrato** e **Término** | vigência | o término é o que aciona o alerta de renovação |
| **Vigência restante** | calculado | dias até o término, sem precisar anotar |
| **Duração** | vigência | duração do último ajuste, como está escrito na planilha |
| **Data-base de reajuste** | vigência | quando o preço pode ser corrigido |
| **Interesse em renovar** | vigência | SIM · Dispensa · Licitar · Não definido |
| **Gestor** e **Fiscal** | vigência | quem responde e quem fiscaliza |
| **jan…dez** | pagamentos | o previsto de cada mês; em branco ≠ 0,00 |
| **TOTAL** | calculado | soma dos doze meses — muda sozinho ao corrigir um mês |
| **Faturas futuras · Empenho · Reservado · SME** | pagamentos | as colunas de totalização |
| **Saldo** | pagamentos | como está na planilha; a tela marca com ⚠ quando não fecha com *empenho + reservado + SME − faturas futuras* |

### Campos da emenda

A planilha da Câmara classifica as emendas pelo **objetivo** — em que o dinheiro
vai ser empregado —, e não pelo setor que recebe. É assim que o sistema as
organiza: o objetivo substituiu o antigo "setor de destino" na ficha, no
formulário e no gráfico da tela inicial.

| Campo | O que é |
|---|---|
| **Número da emenda** | ex.: `0038/2026` |
| **Vereador** | quem destinou o recurso |
| **Natureza da despesa** | ex.: `449052` (equipamento) · `339039` (instalação) |
| **Objetivo** | Monitoramento · Munição · Computadores · Drones · Embarcação · Construção · Diversos · GAMA — texto livre com sugestões dos já usados, porque a cada ano aparecem destinos novos |
| **Finalidade** | o texto da emenda, como veio da Câmara |
| **Valor** | o total da emenda |
| **A liquidar** | comprometido e ainda não pago |
| **Liquidado** | o que já foi pago |
| **Saldo** | calculado: valor − a liquidar − liquidado |
| **Processo** | o processo do SEI ligado à emenda, quando já existe |

### O que se mexe na visão geral

| Onde | O que acontece |
|---|---|
| **Cartão de número** | Sobe e ganha um brilho da cor do próprio assunto ao passar o mouse; o número sobe de zero ao abrir a tela. O clique leva à tela correspondente. |
| **Coluna do gráfico** | A coluna sob o cursor fica cheia e as outras clareiam. A dica traz disponível, comprometido e total em reais. O clique abre as emendas daquele objetivo, já filtradas. |
| **Contrato para renovar** | A linha sobe de leve ao passar o mouse; o clique abre a tela de contratos com a empresa já procurada. |
| **Etiqueta de prazo** | Pisca devagar **só** em contrato com 30 dias ou menos — o prazo em que já não dá tempo de licitar. Piscar os de 90 dias faria a tela toda tremeluzir. |

Duas decisões que valem explicar. **O movimento só existe onde há destino**: um
cartão que sobe ao passar o mouse e não responde ao clique é promessa quebrada,
então os quatro cartões viraram botões de verdade, com foco de teclado e destino
anunciado para leitor de tela. E **quem pede menos movimento não vê movimento**:
a preferência do sistema operacional (usada por quem sente enjoo ou tem enxaqueca
com animação) desliga o surgimento das seções, a contagem dos números, o pulso das
etiquetas e as transições dos botões. É ferramenta de trabalho diário, não vitrine.

O deslize de entrada das telas é feito com uma animação de CSS de dez linhas, e não
com uma biblioteca de animação: o efeito é o mesmo e o navegador não precisa baixar
nada a mais para abrir o painel.

### Exportar Excel

O botão fica na barra de Processos, ao lado de *Novo processo*, e gera
`processos_andamento_AAAA-MM-DD.xlsx` com as onze colunas da tela:

| # | Coluna | O que sai |
|---|---|---|
| 1 | **CATEGORIA / GRUPO** | a fase por extenso e em maiúsculas — `COORDENADORIA SETORIAL ADMINISTRATIVA`, `ACOMPANHAMENTO`, `EXECUÇÃO / ENTREGA`… |
| 2 | **SEI** | número do processo |
| 3 | **OBJETO** | o que está sendo contratado |
| 4 | **MODALIDADE** | AMIL, ARP, LICITAÇÃO… |
| 5 | **EMENDA** | `Sim` quando usa recurso de emenda; em branco quando não |
| 6 | **AUDESP** | número no portal |
| 7 | **PNCP** | número no portal |
| 8 | **STATUS** | a anotação livre do que está sendo feito |
| 9 | **PRIORIDADE** | Baixa, Média, Alta, Muito Alta |
| 10 | **RESPONSÁVEL** | nome |
| 11 | **2º RESPONSÁVEL** | nome |

**Sai o que está na tela.** Se a busca ou os filtros de responsável e prioridade
estiverem ativos, a planilha traz exatamente aquelas linhas, na mesma ordem —
uma planilha que não confere com a tela é pior do que planilha nenhuma, porque
alguém a leva para uma reunião.

Quatro decisões que valem explicar:

* **Tudo é gravado como texto.** AUDESP e PNCP são sequências longas de dígitos
  (`46379400600012026`). Como número, o Excel arredonda para notação científica e
  come o final — o número publicado no portal deixaria de bater.
* **O travessão não vai.** Na tela, `—` quer dizer "em branco". Numa planilha ele
  viraria conteúdo: apareceria como valor no filtro do Excel e quebraria a ordenação.
  Campo vazio sai vazio.
* **A categoria se repete em cada linha**, em vez de virar faixa a cada troca de fase.
  Faixa é bonita de ler e péssima de usar: com a categoria em coluna, o Excel filtra,
  ordena e faz tabela dinâmica por fase — que é o motivo de alguém querer o arquivo.
  O cabeçalho já sai com **filtro automático** ligado.
* **Exportar é leitura**, então o botão aparece para os três perfis, o Leitor incluído.

As larguras das colunas foram medidas pelo conteúdo real: OBJETO e STATUS, que a
equipe escreve por extenso, ganham folga; EMENDA tem três letras e não precisa de
nenhuma.

A biblioteca que monta o arquivo (SheetJS, ~400 KB) só é baixada no primeiro
clique em exportar — quem nunca exporta não paga esse download ao abrir a tela.

### Menu que recolhe

O botão no topo do menu lateral encolhe a barra azul a uma faixa de ícones
(268 px → 72 px). Serve à planilha de Processos: numa tela de 1920 px ela passa
a caber inteira, do SEI à coluna de ações, sem rolagem lateral. Com o menu
recolhido, o nome de cada tela vira dica do mouse, e a escolha fica guardada
no navegador — quem trabalha na planilha o dia inteiro não precisa recolher o
menu a cada visita. No celular nada muda: ali o menu é uma gaveta e abre sempre
com os nomes por extenso.

### Cores com significado (as mesmas em todas as telas)

| Cor | Quer dizer |
|---|---|
| 🟢 Verde | saldo disponível, prazo folgado, processo concluído |
| 🟠 Âmbar | atenção — contrato entre 31 e 90 dias do fim, tarefa entre 8 e 30 dias |
| 🔴 Vermelho | crítico — contrato a 30 dias ou menos, tarefa a 7 dias ou menos, prazo estourado |
| 🔵 Azul | informação neutra (setor, valor já comprometido) |

---

## API

Base: `/api`. Recursos: `setores`, `usuarios`, `emendas`, `contratos`, `pagamentos`, `processos`, `aquisicoes`.

**Todas as rotas exigem sessão**, menos `/api/sessao` e `/api/cadastro`. Escrita
(`POST`, `PUT`, `PATCH`, `DELETE`) exige perfil de Operador ou Administrador;
`/api/admin/*`, `/api/usuarios` e `/api/setores` só aceitam escrita do
Administrador Geral.

### Entrar, sair e pedir acesso

| Método | Rota | Para quê |
|---|---|---|
| `GET` | `/api/sessao` | quem está conectado (a tela usa ao abrir) |
| `POST` | `/api/sessao` | entrar — `{email, senha, manter}`; `403` com `situacao` quando a conta está `PENDENTE` ou `BLOQUEADO` |
| `DELETE` | `/api/sessao` | sair |
| `GET` | `/api/cadastro` | lista de setores para o formulário (única rota aberta que devolve dado) |
| `POST` | `/api/cadastro` | pedir acesso — nasce sempre `LEITOR` + `PENDENTE` |

### Gestão de contas (só Administrador Geral)

| Método | Rota | Para quê |
|---|---|---|
| `GET` | `/api/admin/usuarios` | fila de pendentes + lista de contas |
| `PATCH` | `/api/admin/usuarios/:id` | aprova, bloqueia, muda perfil/setor — `{role, status, id_setor, nome}` |
| `POST` | `/api/admin/usuarios/:id/senha` | define uma senha nova |
| `DELETE` | `/api/admin/usuarios/:id` | apaga o cadastro |

### Dados

| Método | Rota | Para quê |
|---|---|---|
| `GET` | `/api/dashboard?ano=2026` | todos os números da tela inicial em uma requisição |
| `GET` | `/api/<recurso>` | lista — aceita `?busca=`, `?setor=`, `?ano=` |
| `GET` | `/api/processos?situacao=abertos` | só o que está no quadro (`concluidos` faz o inverso) |
| `GET` | `/api/processos?etapa=CSF` | só os de uma etapa |
| `GET` | `/api/processos?modalidade=ARP` | só os de uma modalidade |
| `GET` | `/api/processos?emenda=1` | só os que usam recurso de emenda |
| `GET` | `/api/contratos?status=Vigente` | filtra contratos pela situação |
| `GET` | `/api/contratos?renovar=Licitar` | filtra pela decisão de renovação |
| `GET` | `/api/pagamentos?ano=2026` | os valores mês a mês de um ano (aceita `?contrato=`) |
| `POST` | `/api/<recurso>` | cadastra |
| `GET` | `/api/<recurso>/:id` | um registro |
| `PUT` | `/api/<recurso>/:id` | substitui todos os campos |
| `PATCH` | `/api/<recurso>/:id` | altera só o que foi enviado (usado pelo quadro) |
| `DELETE` | `/api/<recurso>/:id` | exclui |

Erros voltam sempre como `{"erro": "mensagem em português"}` — a mesma frase é exibida
na tela. `422` = campo inválido, `409` = código/número repetido ou regra de negócio
(último administrador, conta sem senha), `404` = não existe, `401` = sem sessão,
`403` = o perfil não permite.

### Segurança do SQL

Nome de tabela e de coluna nunca vêm do corpo da requisição: cada recurso declara suas
colunas em `worker/recursos.ts` e só o que está nessa lista entra no `INSERT`/`UPDATE`,
sempre com parâmetro vinculado (`?`). O que o usuário digita jamais é concatenado no SQL.

---

## Decisões que fugiram do pedido original (e por quê)

- **`etapa` e `status` são coisas diferentes.** `etapa` é a coluna do quadro (CSA, CSF,
  Acompanhamento…), escolhida numa lista fechada. `status` é texto livre — a anotação do
  que está sendo feito agora, escrita por quem toca o processo.
- **`objeto` substituiu `titulo`.** A lista de campos pedida para o cadastro não tinha
  título, e manter os dois viraria dois campos de texto quase iguais no mesmo formulário.
  O objeto da contratação é o nome do processo no cartão e na planilha.
- **Responsável e etapa continuam no formulário**, embora não estivessem na lista de
  campos: sem eles todo processo novo nasceria sem dono e na primeira coluna.
- **A tela de processos virou planilha, não quadro de cartões.** É o formato a que a equipe
  está acostumada. As fases viraram faixas escuras separando os grupos de linhas, e a troca de
  fase passou a ser a coluna *Mover para* — arrastar cartão deixou de existir.
- **Três campos novos vieram da planilha real:** `audesp`, `pncp` e `id_responsavel_2`. Também
  entraram a prioridade **Muito Alta** e a fase **Outros**, que aparecem na planilha.
- **As modalidades continuam em lista fechada.** Na planilha aparecem variações como
  "AMIL - CONTRATO" e "ARP - SECULT"; no seed elas entraram como AMIL e ARP. Se esses
  complementos precisarem ser guardados, a modalidade pode virar lista com texto livre.
- **Arrastar só pela alça.** Com o cartão inteiro arrastável, o navegador não deixa
  selecionar nem copiar o número do SEI. Agora o cartão só vira arrastável enquanto a alça
  (o ícone à esquerda do objeto) está sendo segurada — e o SEI virou um botão que copia com
  um clique, com `navigator.clipboard`, `execCommand` de reserva e, em último caso,
  seleção do texto para Ctrl+C.
- **`data_conclusao` é preenchida pela API**, não pelo usuário: quando a etapa vira
  `Concluído` a data de hoje é gravada, e ao reabrir ela é apagada. Ninguém precisa
  lembrar de anotar.
- **Apagar processo mora dentro da ficha, e não na linha da planilha.** Uma lixeira
  na linha fica a um clique errado de distância do lápis, numa tabela de doze colunas
  em que as linhas têm todas a mesma cara. Dentro da ficha, quem apaga já abriu o
  processo e leu o que ele é. A confirmação toma o rodapé da própria janela em vez de
  abrir uma segunda por cima: a pergunta nasce onde o dedo já está, *Salvar* some
  enquanto ela está no ar, e não há como fechar a janela de cima achando que fechou a
  de baixo. Enquanto a confirmação não é respondida, nada foi enviado ao servidor.
- **Etapa e setor são coisas diferentes.** Etapa é *onde o processo está* no fluxo
  (CSA, CSF, Acompanhamento…); setor é *de quem é* / *para onde vai* (CICC, MATBEL,
  Base Norte…). Por isso CSA e CSF aparecem só como etapas, e não na lista de setores.
- **Setores, processos, contratos e emendas do seed vieram das planilhas reais.**
  Só as compras de exemplo continuam fictícias, para a tela não nascer vazia — e
  por isso elas não apontam para nenhum contrato real, o que inventaria um
  vínculo que não existe. Antes de usar para valer, apague as compras de exemplo.
- **O saldo da emenda é calculado, não guardado.** Um número gravado envelhece
  assim que alguém corrige "a liquidar" ou "liquidado"; calculado na consulta,
  ele nunca discorda das outras colunas.
- **O saldo do contrato é gravado como está na planilha, não recalculado.** Em quatro
  linhas (Servicentro, Multiway, Telefônica e Cor Line) a planilha traz R$ 0,00 onde
  *empenho + reservado + SME − faturas futuras* daria valor positivo. Preferi preservar
  o número da planilha e marcar a divergência com um ⚠ na tela, em vez de sobrescrever
  um dado que pode ter sido ajustado de propósito.
- **Os valores mês a mês ficam em linhas (`pagamentos_contrato`), não em doze colunas.**
  Assim virar o ano não exige mexer no banco: 2027 entra como ano novo e 2026 fica
  guardado. Célula em branco grava nulo, que é diferente de 0,00 — a planilha usa os
  dois com sentidos distintos (sem previsão lançada × sem pagamento no mês).
- **Quase todo campo do contrato é opcional.** Parte dos contratos aparece em só uma
  das duas planilhas: os que vêm do controle de pagamentos não têm número nem vigência,
  e os que vêm do controle de vigência não têm valores. Exigir campo a campo impediria
  de cadastrar o que existe de verdade.
- **Deploy como Worker com assets** em vez de Pages. É o caminho recomendado hoje pela
  Cloudflare e deixa front-end e API sob o mesmo domínio (sem CORS). O adaptador para
  Pages continua no repositório para quem preferir.
- **A senha é conferida no servidor, não no navegador.** Ver a seção *Acesso*: a
  alternativa (conferir no JavaScript) publicaria a senha no código da página e
  deixaria a API aberta a quem digitasse o endereço.

## Próximos passos sugeridos

1. **Registro de quem alterou o quê** (tabela de histórico). Agora que cada
   pessoa tem a sua conta, dá para saber quem mexeu em cada campo — hoje o
   valor anterior simplesmente se perde.
2. Aviso por e-mail dos contratos a vencer, com um Cron Trigger do Worker.
3. Exportação em CSV/PDF das telas de compras, contratos e concluídos.
4. Troca da própria senha pelo usuário comum (hoje só o administrador define).
5. Recuperação de senha por e-mail, para tirar isso do colo do administrador.
