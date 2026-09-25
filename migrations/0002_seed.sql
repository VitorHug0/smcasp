-- =============================================================================
--  Dados de exemplo para testar a aplicação.
--
--  Os SETORES são os reais da SMCASP e das bases da Guarda Municipal. O resto
--  (contratos, emendas, compras e processos) é fictício, só para a tela não
--  nascer vazia — apague com um `DELETE FROM` de cada tabela antes de começar
--  a usar para valer, ou rode só o 0001_schema.sql.
--
--  As datas são calculadas a partir de "hoje", então os alertas de vencimento e
--  os prazos sempre aparecem preenchidos, em qualquer data em que o seed rodar.
--
--    npx wrangler d1 execute secretaria-db --local --file=./migrations/0002_seed.sql
-- =============================================================================

DELETE FROM aquisicoes;
DELETE FROM processos;
DELETE FROM contratos;
DELETE FROM emendas;
DELETE FROM usuarios;
DELETE FROM setores;
DELETE FROM sqlite_sequence WHERE name IN
  ('aquisicoes','processos','contratos','emendas','usuarios','setores');

-- SETORES ---------------------------------------------------------------------
-- A sigla é o que aparece nas etiquetas coloridas das telas, por isso é curta.
-- O nome é o que aparece por extenso nas listas de seleção.
INSERT INTO setores (nome, sigla, grupo) VALUES
  ('CICC',          'CICC',   'SMCASP'),            -- 1
  ('MATBEL',        'MATBEL', 'SMCASP'),            -- 2
  ('Gabinete',      'GAB',    'SMCASP'),            -- 3
  ('Logística',     'LOG',    'SMCASP'),            -- 4
  ('RH',            'RH',     'SMCASP'),            -- 5
  ('Corregedoria',  'COR',    'SMCASP'),            -- 6
  ('DA',            'DA',     'SMCASP'),            -- 7
  ('Estatística',   'EST',    'SMCASP'),            -- 8
  ('Comando',       'CMD',    'SMCASP'),            -- 9
  ('Porte',         'PORTE',  'SMCASP'),            -- 10
  ('Base Norte',    'NORTE',  'Guarda Municipal'),  -- 11
  ('Academia',      'ACAD',   'Guarda Municipal'),  -- 12
  ('Base Sul',      'SUL',    'Guarda Municipal'),  -- 13
  ('Base Leste',    'LESTE',  'Guarda Municipal'),  -- 14
  ('Base Oeste',    'OESTE',  'Guarda Municipal'),  -- 15
  ('Base Centro',   'CENTRO', 'Guarda Municipal'),  -- 16
  ('SAE',           'SAE',    'Guarda Municipal');  -- 17

-- USUARIOS --------------------------------------------------------------------
-- A equipe que aparece na planilha de controle. Estes seis entram como
-- responsáveis de processo, não como contas de acesso: ficam sem senha
-- (senha_hash = '', o padrão da tabela), e senha vazia nunca confere no login.
-- Para dar acesso a um deles, o caminho é o de todo mundo — a pessoa se
-- cadastra em /cadastro e o administrador libera em /admin/usuarios.
INSERT INTO usuarios (nome, email, role, status, id_setor) VALUES
  ('Rafael',      'rafael@smcasp.gov.br',      'LEITOR', 'ATIVO', 7),  -- 1 · DA
  ('Simone',      'simone@smcasp.gov.br',      'LEITOR', 'ATIVO', 7),  -- 2 · DA
  ('Ana Letícia', 'ana.leticia@smcasp.gov.br', 'LEITOR', 'ATIVO', 3),  -- 3 · Gabinete
  ('Daniel',      'daniel@smcasp.gov.br',      'LEITOR', 'ATIVO', 4),  -- 4 · Logística
  ('Vitor',       'vitor@smcasp.gov.br',       'LEITOR', 'ATIVO', 1),  -- 5 · CICC
  ('Waldir',      'waldir@smcasp.gov.br',      'LEITOR', 'ATIVO', 4);  -- 6 · Logística

-- ADMINISTRADOR GERAL ---------------------------------------------------------
-- A única conta que já nasce podendo entrar e liberar as outras. Sem ela não
-- haveria como aprovar o primeiro cadastro: o sistema ficaria trancado por
-- fora, com a fila de pendentes e ninguém para atendê-la.
--
-- A senha combinada NÃO está aqui. O que está guardado é o resultado de
-- PBKDF2-SHA256 com 120.000 repetições sobre um sal sorteado — do hash não se
-- volta para a senha, nem tendo o arquivo em mãos.
--
-- DEPOIS DE PUBLICAR, troque a senha: entre com ela, abra "Usuários" e use
-- "Alterar senha" na própria conta. O hash abaixo deixa de valer na hora.
INSERT INTO usuarios (nome, email, senha_hash, role, status, id_setor) VALUES
  ('Administrador Geral',
   'da.smcasp@campinas.sp.gov.br',
   'pbkdf2$sha256$100000$ead7f70bb30cec7d94c0160d9d6e7500$23434298eb9ac8f756809aa898e530adc78b1204383a3689b3b9714d6be1c40c',
   'SUPER_ADMIN', 'ATIVO', 7);                                         -- 7 · DA

-- EMENDAS ---------------------------------------------------------------------
-- As 46 emendas impositivas de 2026, transcritas da planilha "EMENDAS
-- IMPOSITIVAS 2026". Conferidas contra os totais da própria planilha:
--   valor R$ 1.868.250,00 · a liquidar R$ 120.167,00 · liquidado R$ 0,00
--   saldo R$ 1.748.083,00 (= valor - a liquidar - liquidado, linha a linha)
--
-- Uma observação de transcrição: na linha do vereador Nelson Hossri a coluna
-- "Emenda" traz 'R$ 0,81' no lugar do número — mantive como está na planilha,
-- para não inventar um número de emenda que não foi informado.
INSERT INTO emendas
  (codigo, autor, ano, natureza_despesa,
   finalidade,
   objetivo, valor_recebido, a_liquidar, liquidado, processo)
VALUES
  ('0038/2026', 'DR. YANKO', 2026, '449052',
   'AMPLIAÇÃO DO SISTEMA DE MONITORAMENTO DE CAMPINAS. AQUISIÇÃO E INSTALAÇÃO DE EQUIPAMENTOS DESTINADOS AO SISTEMA DE MONITORAMENTO DE CAMPINAS. AMPLIAR A CAPACIDADE DE VIGILÂNCIA DO SISTEMA DE MONITORAMENTO DE CAMPINAS.',
   'Monitoramento', 100000.00, 63767.00, 0.00, 'PMC.2026.00037725-46 - CICC Móvel'),
  ('0149/2026', 'AILTON DA FARMÁCIA', 2026, '449052',
   'Ampliar a capacidade de vigilância do sistema de monitoramento de Campinas, especialmente no cruzamento dos bairros: Vila Georgina e Jardim Cura D''ars.',
   'Monitoramento', 30000.00, 0.00, 0.00, NULL),
  ('0218/2026', 'LUIZ ROSSINI', 2026, '449052',
   'Ampliação do Sistema de Monitoramento de Campinas - Implantação em Barão Geraldo------ Dotação equipamento permanente:Dotação 161000.16110.06.122.1029.4106.449052------ Dotação serviço de instalação:Dotação 161000.16110.06.122.1029.4106.339039',
   'Monitoramento', 20000.00, 0.00, 0.00, NULL),
  ('0314/2026', 'HEBERT GANEM', 2026, '449052',
   'Aquisição e instalação de equipamento destinado ao sistema de monitoriamento de Campinas.',
   'Monitoramento', 10000.00, 0.00, 0.00, NULL),
  ('0342/2026', 'ARNALDO SALVETTI', 2026, '449052',
   'Ampliação de Cameras de Monitoramento Veicular',
   'Monitoramento', 60000.00, 0.00, 0.00, NULL),
  ('0344/2026', 'ARNALDO SALVETTI', 2026, '449052',
   'Ampliação de Monitoramento por Cameras Speed DOME',
   'Monitoramento', 10000.00, 0.00, 0.00, NULL),
  ('0345/2026', 'ARNALDO SALVETTI', 2026, '339030',
   'MUNIÇÃO',
   'Munição', 12000.00, 0.00, 0.00, NULL),
  ('0369/2026', 'NICK SCHNEIDER', 2026, '339039',
   'Apoio na implantação de câmeras de monitoramento na região do castelo/jd chapadão / bonfim e outros.',
   'Monitoramento', 45000.00, 0.00, 0.00, NULL),
  ('0371/2026', 'NICK SCHNEIDER', 2026, '449051',
   'Emenda de apoio à construção da nova sede do 35° Batalhão da Polícia Militar a iniciar-se no Parque Ecológico Monsenhor Emílio José Salim.',
   'Construção', 20000.00, 0.00, 0.00, NULL),
  ('0450/2026', 'PAULO HADDAD', 2026, '449052',
   'Secretaria de Segurança Pública destinação da Emenda para Ampliação do Sistema de Videomonitoramento da Cidade de Campinas no valor de R$ 38.250,00',
   'Monitoramento', 38250.00, 0.00, 0.00, NULL),
  ('0452/2026', 'PAULO HADDAD', 2026, '339039',
   'Secretaria de Segurança Pública Emenda para dotação de serviços de Instalação no valor de R$ 6.750,00',
   'Monitoramento', 6750.00, 0.00, 0.00, NULL),
  ('0482/2026', 'ROBERTO ALVES', 2026, '449052',
   'A destinação do valor de R$ 50.000,00 (cinquenta mil reais) destina-se à aquisição de computadores com o objetivo de modernizar a infraestrutura tecnológica e garantir melhores condições de trabalho e atendimento ao público. A necessidade do investimento decorre do fato de que os equipamentos atualmente disponíveis encontram-se obsoletos, com limitações de desempenho que prejudicam atividades essenciais, como acesso a sistemas, elaboração de documentos, pesquisas, desenvolvimento de projetos e execução de procedimentos administrativos e pedagógicos. A compra de novos computadores permitirá: Aumento da eficiência. Melhoria da qualidade dos serviços prestados. Ampliação do acesso à tecnologia. Adequação às exigências tecnológicas atuais, representando um investimento essencial, que trará benefícios diretos e imediatos ao funcionamento da instituição, ao desenvolvimento das atividades e ao atendimento de sua missão social.',
   'Computadores', 50000.00, 0.00, 0.00, NULL),
  ('0557/2026', 'RODRIGO DA FARMADIC', 2026, '449052',
   'A presente emenda tem por finalidade a destinação de recursos para o fortalecimento da segurança pública, objetivando: a) aquisição de câmeras de monitoramento; b) implantação de uma central de monitoramento para atender o Distrito do Ouro Verde.',
   'Monitoramento', 120000.00, 0.00, 0.00, NULL),
  ('0595/2026', 'MARCELO SILVA', 2026, '339030',
   'Emenda Parlamentar a ser destinada à Secretaria de Segurança Publica para aquisição de munição.',
   'Munição', 48000.00, 0.00, 0.00, NULL),
  ('0690/2026', 'LUIZ YABIKU', 2026, '339039',
   'Ampliação do sitema de videomonitoramento de Campinas.',
   'Monitoramento', 6750.00, 0.00, 0.00, NULL),
  ('0697/2026', 'EDUARDO MAGOGA', 2026, '449052',
   'A presente Emenda Impositiva destina-se a fortalecer a capacidade de vigilância do Sistema de Monitoramento de Campinas, mediante a aquisição de novos equipamentos.',
   'Monitoramento', 16000.00, 0.00, 0.00, NULL),
  ('0699/2026', 'LUIZ YABIKU', 2026, '449052',
   'Apoio na implantação de câmeras de monitoramento no distrito de Barão Geraldo.',
   'Monitoramento', 136000.00, 0.00, 0.00, NULL),
  ('0703/2026', 'LUIZ YABIKU', 2026, '339039',
   'Ampliação do sistema de videomonitoramento do distrito de Barão Geraldo.',
   'Monitoramento', 24000.00, 0.00, 0.00, NULL),
  ('0706/2026', 'EDUARDO MAGOGA', 2026, '339039',
   'A presente Emenda Impositiva tem por objetivo ampliar a capacidade de vigilância do Sistema de Monitoramento de Campinas, mediante a instalação de novos equipamentos.',
   'Monitoramento', 4000.00, 0.00, 0.00, NULL),
  ('0708/2026', 'EDUARDO MAGOGA', 2026, '449052',
   'A presente Emenda Impositiva visa a ampliação do patrulhamento, mediante a aquisição de Drones equipados com câmara térmica, para apoio às operações de Ações Especiais da Guarda Municipal de Campinas.',
   'Drones', 10000.00, 0.00, 0.00, NULL),
  ('0712/2026', 'DR. YANKO', 2026, '339039',
   'EMENDA DESTINADA A AMPLIAÇÃO DO SISTEMA DE MONITORAMENTO DE CAMPINAS SERVIÇO DE INSTALAÇÃO',
   'Monitoramento', 10000.00, 0.00, 0.00, NULL),
  ('0713/2026', 'EDUARDO MAGOGA', 2026, '449052',
   'A presente Emenda Impositiva visa à aquisição de uma embarcação (Barco de Alumínio com cobertura), motor de popa e carreta rodoviária, para a implementação da Patrulha Náutica e apoio às ações de fiscalização ambiental.',
   'Embarcação', 10000.00, 0.00, 0.00, NULL),
  ('0849/2026', 'DEBORA PALERMO', 2026, '449052',
   'A Secretaria Municipal de Segurança Pública, monitora através de Câmeras, as vias e entradas do nosso município, e para que seja ampliado, este mandato encaminha esta emenda para ampliação do Sistema de Videomonitoramento da Cidade de Campinas.',
   'Monitoramento', 85000.00, 28200.00, 0.00, 'PMC.2026.00138344-47 - ILUMINADOR INFRAVERMELHO'),
  ('0853/2026', 'DEBORA PALERMO', 2026, '339039',
   'A Secretaria Municipal de Segurança Pública, monitora através de Câmeras, as vias e entradas do nosso município, e para que seja ampliado, este mandato encaminha esta emenda para serviço de instalação da ampliação do Sistema de Videomonitoramento da Cidade de Campinas',
   'Monitoramento', 15000.00, 0.00, 0.00, NULL),
  ('0929/2026', 'LUIZ YABIKU', 2026, '449052',
   'Apoio na implantação de câmeras de monitoramento da região do Castelo/Jardim Chapadão/Bonfim e outros.',
   'Monitoramento', 38250.00, 0.00, 0.00, NULL),
  ('0956/2026', 'RODRIGO DA FARMADIC', 2026, '339039',
   'A presente emenda tem por finalidade a destinação de recursos para instalação de equipamentos de monitoramento objetivando o fortalecimento da segurança pública no Distrito do Ouro Verde.',
   'Monitoramento', 30000.00, 0.00, 0.00, NULL),
  ('0961/2026', 'OTTO ALEJANDRO', 2026, '339039',
   'Implementar através de Emenda Parlamentar um sistema de monitoramento por câmeras de CFTV nas ruas Leandro Gonçalves e Benedito Cândido Ramos, do bairro Parque Valença II, com foco em ações de segurança pública, controle territorial e inteligência operacional. Destinação para serviço de instalação.',
   'Monitoramento', 4500.00, 0.00, 0.00, NULL),
  ('0965/2026', 'OTTO ALEJANDRO', 2026, '449052',
   'Implementar através de Emenda Parlamentar um sistema de monitoramento por câmeras de CFTV nas ruas Leandro Gonçalves e Benedito Cândido Ramos, do bairro Parque Valença II, com foco em ações de segurança pública, controle territorial e inteligência operacional. Destinação para compra de cameras.',
   'Monitoramento', 25500.00, 0.00, 0.00, NULL),
  ('1162/2026', 'VINI OLIVEIRA', 2026, '449052',
   'Aquisição de computadores modernos para melhor atendimento e prestação do serviço da Guarda Municipal de Campinas',
   'Computadores', 100000.00, 0.00, 0.00, NULL),
  ('1233/2026', 'LUIZ ROSSINI', 2026, '449052',
   'Monitoramento Guarda Municipal - IV Centenário, Novo Chapadão, Chapadão, Bonfim, Guanabara, Botafogo, Castelo e região 45.000,00',
   'Monitoramento', 45000.00, 0.00, 0.00, NULL),
  ('1239/2026', 'PERMÍNIO MONTEIRO', 2026, '449052',
   'Destinação de emenda para Ampliação de Câmeras de Monitoramento Veicular - Compra de equipamentos permanentes',
   'Monitoramento', 85000.00, 28200.00, 0.00, 'PMC.2026.00138344-47 - ILUMINADOR INFRAVERMELHO'),
  ('1246/2026', 'PERMÍNIO MONTEIRO', 2026, '339039',
   'Ampliação do Sistema de Videomonitoramento da Cidade de Campinas - Serviço de instalação',
   'Monitoramento', 15000.00, 0.00, 0.00, NULL),
  ('1300/2026', 'RUBENS GÁS', 2026, '449052',
   'Emenda destinada à Secretaria de Segurança Pública para o investimento no equipamento de videomonitoramento que deverá ser instalada na região dos Amarais, no valor de R$ 51.000,00',
   'Monitoramento', 51000.00, 0.00, 0.00, NULL),
  ('1305/2026', 'RUBENS GÁS', 2026, '339039',
   'Emenda destinada à Secretaria de Segurança Pública para os custos com a instalação do equipamento de videomonitoramento que deverá ser instalada na região dos Amarais, no valor de R$ 9.000,00',
   'Monitoramento', 9000.00, 0.00, 0.00, NULL),
  ('1390/2026', 'GUILHERME TEIXEIRA', 2026, '449052',
   'Ampliação do Sistema de Videomonitoramento da Cidade de Campinas',
   'Monitoramento', 85000.00, 0.00, 0.00, NULL),
  ('1418/2026', 'GUILHERME TEIXEIRA', 2026, '339039',
   'Ampliação do Sistema de Videomonitoramento da Cidade de Campinas - Serviço de instalação',
   'Monitoramento', 15000.00, 0.00, 0.00, NULL),
  ('1431/2026', 'CARMO LUIZ', 2026, '449052',
   'Ampliação do Sistema de Videomonitoramento da Cidade de Campinas com a Implementação de um sistema de monitoramento por câmeras de CFTV nos principais pontos do Parque Ecológico Benevenuto Tilli (Lagoa do São Domingos), com foco em ações de segurança pública, controle territorial e inteligência operacional.',
   'Monitoramento', 51000.00, 0.00, 0.00, NULL),
  ('1437/2026', 'CARMO LUIZ', 2026, '339039',
   'Ampliação do Sistema de Videomonitoramento da Cidade de Campinas com a Implementação de um sistema de monitoramento por câmeras de CFTV nos principais pontos do Parque Ecológico Benevenuto Tilli (Lagoa do São Domingos), com foco em ações de segurança pública, controle territorial e inteligência operacional.',
   'Monitoramento', 9000.00, 0.00, 0.00, NULL),
  ('R$ 0,81', 'NELSON HOSSRI', 2026, '449052',
   'Emenda destinada à ampliação do sistema de vídeo monitoramento.',
   'Monitoramento', 60000.00, 0.00, 0.00, NULL),
  ('1715/2026', 'HIGOR DIEGO', 2026, '449052',
   'Ampliação do Sistema de Videomonitoramento da Cidade de Campinas, por meio da implementação de câmeras de monitoramento com cobertura integral do Ginásio de Esportes Jorge Mendonça.',
   'Monitoramento', 10000.00, 0.00, 0.00, NULL),
  ('1623/2026', 'GUILHERME TEIXEIRA', 2026, '449052',
   'Aquisição de equipamentos/materiais permanentes diversos',
   'Diversos', 100000.00, 0.00, 0.00, NULL),
  ('1590/2026', 'NICK SCHNEIDER', 2026, '449052',
   'Apoio na implantação de câmeras de monitoramento na Praça Maria Mãe do Povo, localizada na Vila Pe. Manoel da Nóbrega',
   'Monitoramento', 20000.00, 0.00, 0.00, NULL),
  ('1515/2026', 'AILTON DA FARMÁCIA', 2026, '449052',
   'Ampliar a capacidade de vigilância do sistema de monitoramento de campinas',
   'Monitoramento', 50000.00, 0.00, 0.00, NULL),
  ('1667/2026', 'NELSON HOSSRI', 2026, '449052',
   'Emenda destinada à ampliação do sistema de videomonitoramento',
   'Monitoramento', 40000.00, 0.00, 0.00, NULL),
  ('0666/2026', 'LUIZ YABIKU', 2026, '449052',
   'Ampliação do sistema de videomonitoramento da cidade de Campinas.',
   'Monitoramento', 38250.00, 0.00, 0.00, NULL),
  ('1721/2026', 'HIGOR DIEGO', 2026, '449052',
   'A emenda tem como objetivo, o fortalecimento das ações de combate a violência contra meninas e mulheres. Tendo um espaço integrado entre diversas secretarias oferecendo serviços e apoio.',
   'GAMA', 100000.00, 0.00, 0.00, NULL);

-- CONTRATOS -------------------------------------------------------------------
-- Transcritos das duas planilhas de controle da Coordenadoria (setembro/2026):
--   "CONTRATOS | CONTROLE"      -> 14 contratos, com vigência, gestor e fiscal
--   "Controle CSF 2 Pagamentos" -> 16 empresas, com os valores mês a mês
-- Nove aparecem nas duas planilhas; somados sem repetir, dão 21 contratos.
-- Os que vêm só do controle de pagamentos não têm número de contrato nem
-- vigência preenchidos, e os que vêm só do controle de vigência não têm valor.
--
-- O saldo é gravado como está na planilha. Em quatro linhas (Servicentro,
-- Multiway, Telefônica e Cor Line) a planilha traz R$ 0,00 onde
-- empenho + reservado + SME - faturas futuras daria valor positivo; mantive o
-- número da planilha em vez de recalcular.
INSERT INTO contratos
  (sei, numero_contrato, numero_ultimo_ajuste, fornecedor, objeto,
   data_inicio, data_fim_vigencia, duracao, data_base_reajuste,
   interesse_renovar, gestor, fiscal,
   faturas_futuras, empenho, reservado, sme, saldo)
VALUES
  ('PMC.2023.00025582-22', '265/23', NULL, 'SABEMI (Seguro)', 'Seguro',
   '2023-09-25', '2026-09-21', '12 meses', '2023-06-20', 'SIM', 'Rafael Todero Nora', 'Hércules Marques',
   141000.00, 49449.60, 142588.26, 0.00, 51037.86),
  ('PMC.2024.00081589-60', NULL, NULL, 'SURA (Seguro Yaris)', 'Seguro do Yaris',
   '2024-10-03', '2026-09-30', '12 meses', NULL, 'Dispensa', NULL, NULL,
   0, 0, 0, 0, 0),
  ('PMC.2023.00015248-98', '300/23', NULL, 'CS - Brasil (Veículos)', 'Locação de veículos',
   '2023-11-01', '2026-10-31', '180 dias', '2023-06-22', 'Licitar', 'Rafael Todero Nora', 'Ademir José dos Santos',
   1890000.00, 502770.23, 0.00, 310068.98, -1077160.79),
  ('PMC.2025.00070931-12', '485/25', NULL, 'Pejota Pet', NULL,
   '2026-02-06', '2027-02-05', '12 meses', '2025-07-03', 'SIM', 'Rafael Todero Nora', 'Waldir Lanza Junior',
   0, 0, 0, 0, 0),
  ('PMC.2026.00037186-81', NULL, NULL, 'Medicamento K9', 'Medicamentos para os cães',
   '2025-04-01', '2027-03-31', '12 meses', NULL, 'Dispensa', NULL, NULL,
   0, 0, 0, 0, 0),
  ('PMC.2026.00012545-05', 'Ordem de Fornecimento', NULL, 'Telefonica Cloud', 'Nuvem',
   '2026-06-10', '2027-06-09', '12 meses', NULL, 'Dispensa', NULL, NULL,
   0, 0, 0, 0, 0),
  ('PMC.2024.00017025-91', '433/24', NULL, 'Localizar (Motos)', 'Locação de motos',
   '2024-12-13', '2027-06-12', '30 meses', '2024-04-29', 'Licitar', 'Rafael Todero Nora', 'Pedro Gabriel Rodrigues / Ademir José dos Santos',
   165000.00, 60351.00, 0.00, 89595.40, -15053.60),
  ('PMC.2024.00019364-01', '147/26', NULL, 'Sentry Multiway', NULL,
   '2025-07-17', '2027-07-16', '12 meses', '2025-03-10', 'SIM', 'Rafael Todero Nora', 'Mauricio Campos Ferreira',
   538400.00, 527606.24, 0.00, 32375.00, 0.00),
  ('PMC.2023.00037747-27', NULL, NULL, 'Sociedade Hípica', NULL,
   '2023-08-01', '2027-07-31', '48 meses', NULL, 'SIM', NULL, NULL,
   0, 0, 0, 0, 0),
  ('PMC.2021.00080619-31', '176/22', '236/25', 'Servicentro', NULL,
   '2022-11-10', '2027-12-11', '24 meses', NULL, 'Licitar', 'Rafael Todero Nora', 'Waldir Lanza Junior',
   0.00, 46249.05, 0.00, 0.00, 0.00),
  ('PMC.2025.00067491-62', '451/2025', NULL, 'TRC (Rádio)', 'Rádiocomunicação',
   '2025-12-16', '2028-06-15', '30 meses', '2025-07-31', 'SIM', 'Rafael Todero Nora', 'Fernanda Cristina Camargo Guimarães / Ademir José dos Santos / Hércules Marques',
   741060.00, 200749.52, 0.00, 104344.00, -435966.48),
  ('PMC.2023.00052219-71', '270/23', NULL, 'Sanasa', 'Água e esgoto',
   '2023-10-02', '2028-10-01', '60 meses', NULL, 'SIM', 'Rafael Todero Nora', 'Francisco Danilo Alves Gomes',
   540000.00, 98190.65, 0.00, 0.00, -441809.35),
  ('PMC.2025.00078933-13', '314/25', NULL, 'CPFL', 'Energia elétrica',
   '2025-08-14', '2030-08-14', '60 meses', NULL, 'SIM', 'Rafael Todero Nora', 'Fernando Sasaki Fagionato',
   267641.98, 57297.37, 0.00, 0.00, -210344.61),
  ('PMC.2026.00027617-29', '246/2026', NULL, 'Geo City', NULL,
   '2026-06-30', '2027-06-30', '12 meses', NULL, 'Não definido', 'Rafael Todero Nora', 'Gerson Aparecido Ortega / Mauricio Campos Ferreira',
   2328200.00, 3085150.00, 0.00, 0.00, 756950.00),
  ('PMC.2022.00020214-15', NULL, NULL, 'IMA', NULL,
   NULL, NULL, NULL, NULL, 'Não definido', NULL, NULL,
   140000.00, 129472.14, 0.00, 0.00, -10527.86),
  ('PMC.2022.00088662-71', NULL, NULL, 'Telefônica', NULL,
   NULL, NULL, NULL, NULL, 'Não definido', NULL, NULL,
   3300.00, 28622.88, 0.00, 0.00, 0.00),
  ('PMC.2021.00022256-65', NULL, NULL, 'Cotrans', NULL,
   NULL, NULL, NULL, NULL, 'Não definido', NULL, NULL,
   34340.00, 20888.75, 0.00, 0.00, -13451.25),
  ('PMC.2023.00074029-13', NULL, NULL, 'Prime', NULL,
   NULL, NULL, NULL, NULL, 'Não definido', NULL, NULL,
   611072.29, 987035.60, 0, 70000.00, 445963.31),
  ('PMC.2023.00052484-02', NULL, NULL, 'Cor Line', NULL,
   NULL, NULL, NULL, NULL, 'Não definido', NULL, NULL,
   342000.00, 353821.00, 0.00, 0.00, 0.00),
  ('PMC.2022.00050814-27', NULL, NULL, 'TIM', NULL,
   NULL, NULL, NULL, NULL, 'Não definido', NULL, NULL,
   34458.00, 34458.00, 0.00, 0.00, 0.00),
  ('PMC.2025.00175372-18', NULL, NULL, 'Viaturas', NULL,
   NULL, NULL, NULL, NULL, 'Não definido', NULL, NULL,
   0.00, 0.00, 3675519.00, 0, 3675519.00);

-- PAGAMENTOS DE 2026 --------------------------------------------------------
-- Um INSERT por empresa, na mesma ordem das linhas da planilha, com os doze
-- meses de jan a dez. O contrato é localizado pelo SEI, para que o seed não
-- dependa dos ids gerados acima.
-- NULL = célula em branco na planilha (mês sem previsão lançada), que é
-- diferente de 0,00 (mês sem pagamento).

--   CS Frotas
INSERT INTO pagamentos_contrato (id_contrato, ano, mes, valor) VALUES
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00015248-98'), 2026,  1,  328476.89),  -- jan/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00015248-98'), 2026,  2,  329701.86),  -- fev/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00015248-98'), 2026,  3,  326622.12),  -- mar/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00015248-98'), 2026,  4,  283101.06),  -- abr/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00015248-98'), 2026,  5,  315000.00),  -- mai/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00015248-98'), 2026,  6,  306204.94),  -- jun/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00015248-98'), 2026,  7,  301830.07),  -- jul/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00015248-98'), 2026,  8,  315000.00),  -- ago/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00015248-98'), 2026,  9,  315000.00),  -- set/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00015248-98'), 2026, 10,  315000.00),  -- out/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00015248-98'), 2026, 11,  315000.00),  -- nov/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00015248-98'), 2026, 12,  315000.00);  -- dez/26

--   Localizar
INSERT INTO pagamentos_contrato (id_contrato, ano, mes, valor) VALUES
  ((SELECT id FROM contratos WHERE sei = 'PMC.2024.00017025-91'), 2026,  1,   32292.45),  -- jan/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2024.00017025-91'), 2026,  2,   32292.45),  -- fev/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2024.00017025-91'), 2026,  3,   32292.45),  -- mar/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2024.00017025-91'), 2026,  4,   31923.40),  -- abr/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2024.00017025-91'), 2026,  5,   32107.92),  -- mai/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2024.00017025-91'), 2026,  6,   35009.63),  -- jun/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2024.00017025-91'), 2026,  7,   31706.89),  -- jul/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2024.00017025-91'), 2026,  8,   33000.00),  -- ago/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2024.00017025-91'), 2026,  9,   33000.00),  -- set/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2024.00017025-91'), 2026, 10,   33000.00),  -- out/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2024.00017025-91'), 2026, 11,   33000.00),  -- nov/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2024.00017025-91'), 2026, 12,   33000.00);  -- dez/26

--   TRC
INSERT INTO pagamentos_contrato (id_contrato, ano, mes, valor) VALUES
  ((SELECT id FROM contratos WHERE sei = 'PMC.2025.00067491-62'), 2026,  1,   75133.80),  -- jan/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2025.00067491-62'), 2026,  2,  135902.33),  -- fev/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2025.00067491-62'), 2026,  3,  148212.00),  -- mar/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2025.00067491-62'), 2026,  4,  148212.00),  -- abr/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2025.00067491-62'), 2026,  5,  148212.00),  -- mai/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2025.00067491-62'), 2026,  6,  148212.00),  -- jun/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2025.00067491-62'), 2026,  7,  148212.00),  -- jul/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2025.00067491-62'), 2026,  8,  148212.00),  -- ago/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2025.00067491-62'), 2026,  9,  148212.00),  -- set/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2025.00067491-62'), 2026, 10,  148212.00),  -- out/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2025.00067491-62'), 2026, 11,  148212.00),  -- nov/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2025.00067491-62'), 2026, 12,  148212.00);  -- dez/26

--   SABEMI
INSERT INTO pagamentos_contrato (id_contrato, ano, mes, valor) VALUES
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00025582-22'), 2026,  1,   24038.64),  -- jan/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00025582-22'), 2026,  2,   24038.64),  -- fev/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00025582-22'), 2026,  3,   24005.16),  -- mar/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00025582-22'), 2026,  4,   23871.24),  -- abr/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00025582-22'), 2026,  5,   23770.80),  -- mai/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00025582-22'), 2026,  6,   23703.84),  -- jun/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00025582-22'), 2026,  7,   23500.00),  -- jul/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00025582-22'), 2026,  8,   23500.00),  -- ago/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00025582-22'), 2026,  9,   23500.00),  -- set/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00025582-22'), 2026, 10,   23500.00),  -- out/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00025582-22'), 2026, 11,   23500.00),  -- nov/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00025582-22'), 2026, 12,   23500.00);  -- dez/26

--   IMA
INSERT INTO pagamentos_contrato (id_contrato, ano, mes, valor) VALUES
  ((SELECT id FROM contratos WHERE sei = 'PMC.2022.00020214-15'), 2026,  1,   14015.84),  -- jan/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2022.00020214-15'), 2026,  2,   27278.66),  -- fev/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2022.00020214-15'), 2026,  3,   26411.98),  -- mar/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2022.00020214-15'), 2026,  4,   28017.48),  -- abr/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2022.00020214-15'), 2026,  5,   28014.50),  -- mai/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2022.00020214-15'), 2026,  6,   27761.57),  -- jun/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2022.00020214-15'), 2026,  7,   26192.73),  -- jul/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2022.00020214-15'), 2026,  8,   28000.00),  -- ago/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2022.00020214-15'), 2026,  9,   28000.00),  -- set/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2022.00020214-15'), 2026, 10,   28000.00),  -- out/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2022.00020214-15'), 2026, 11,   28000.00),  -- nov/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2022.00020214-15'), 2026, 12,   28000.00);  -- dez/26

--   Servicentro
INSERT INTO pagamentos_contrato (id_contrato, ano, mes, valor) VALUES
  ((SELECT id FROM contratos WHERE sei = 'PMC.2021.00080619-31'), 2026,  1,    3119.30),  -- jan/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2021.00080619-31'), 2026,  2,       0.00),  -- fev/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2021.00080619-31'), 2026,  3,   15375.80),  -- mar/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2021.00080619-31'), 2026,  4,   10083.70),  -- abr/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2021.00080619-31'), 2026,  5,    1641.70),  -- mai/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2021.00080619-31'), 2026,  6,    6021.94),  -- jun/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2021.00080619-31'), 2026,  7,    9490.57),  -- jul/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2021.00080619-31'), 2026,  8,       0.00),  -- ago/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2021.00080619-31'), 2026,  9,       0.00),  -- set/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2021.00080619-31'), 2026, 10,       0.00),  -- out/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2021.00080619-31'), 2026, 11,       0.00),  -- nov/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2021.00080619-31'), 2026, 12,       0.00);  -- dez/26

--   Multiway
INSERT INTO pagamentos_contrato (id_contrato, ano, mes, valor) VALUES
  ((SELECT id FROM contratos WHERE sei = 'PMC.2024.00019364-01'), 2026,  1,   88990.00),  -- jan/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2024.00019364-01'), 2026,  2,   88990.00),  -- fev/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2024.00019364-01'), 2026,  3,   88990.00),  -- mar/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2024.00019364-01'), 2026,  4,   88990.00),  -- abr/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2024.00019364-01'), 2026,  5,   88990.00),  -- mai/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2024.00019364-01'), 2026,  6,   88990.00),  -- jun/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2024.00019364-01'), 2026,  7,   88900.00),  -- jul/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2024.00019364-01'), 2026,  8,   89900.00),  -- ago/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2024.00019364-01'), 2026,  9,   89900.00),  -- set/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2024.00019364-01'), 2026, 10,   89900.00),  -- out/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2024.00019364-01'), 2026, 11,   89900.00),  -- nov/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2024.00019364-01'), 2026, 12,   89900.00);  -- dez/26

--   CPFL
INSERT INTO pagamentos_contrato (id_contrato, ano, mes, valor) VALUES
  ((SELECT id FROM contratos WHERE sei = 'PMC.2025.00078933-13'), 2026,  1,   29921.21),  -- jan/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2025.00078933-13'), 2026,  2,   28137.21),  -- fev/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2025.00078933-13'), 2026,  3,       NULL),  -- mar/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2025.00078933-13'), 2026,  4,   28321.20),  -- abr/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2025.00078933-13'), 2026,  5,   29320.78),  -- mai/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2025.00078933-13'), 2026,  6,   30000.00),  -- jun/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2025.00078933-13'), 2026,  7,   30000.00),  -- jul/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2025.00078933-13'), 2026,  8,   30000.00),  -- ago/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2025.00078933-13'), 2026,  9,   30000.00),  -- set/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2025.00078933-13'), 2026, 10,   30000.00),  -- out/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2025.00078933-13'), 2026, 11,   30000.00),  -- nov/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2025.00078933-13'), 2026, 12,   30000.00);  -- dez/26

--   Sanasa
INSERT INTO pagamentos_contrato (id_contrato, ano, mes, valor) VALUES
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00052219-71'), 2026,  1,   79809.01),  -- jan/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00052219-71'), 2026,  2,   89300.35),  -- fev/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00052219-71'), 2026,  3,   71962.30),  -- mar/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00052219-71'), 2026,  4,   82086.35),  -- abr/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00052219-71'), 2026,  5,   80630.73),  -- mai/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00052219-71'), 2026,  6,   89558.01),  -- jun/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00052219-71'), 2026,  7,   90000.00),  -- jul/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00052219-71'), 2026,  8,   90000.00),  -- ago/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00052219-71'), 2026,  9,   90000.00),  -- set/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00052219-71'), 2026, 10,   90000.00),  -- out/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00052219-71'), 2026, 11,   90000.00),  -- nov/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00052219-71'), 2026, 12,   90000.00);  -- dez/26

--   Telefônica
INSERT INTO pagamentos_contrato (id_contrato, ano, mes, valor) VALUES
  ((SELECT id FROM contratos WHERE sei = 'PMC.2022.00088662-71'), 2026,  1,     900.00),  -- jan/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2022.00088662-71'), 2026,  2,     900.00),  -- fev/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2022.00088662-71'), 2026,  3,     900.00),  -- mar/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2022.00088662-71'), 2026,  4,     900.00),  -- abr/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2022.00088662-71'), 2026,  5,     550.00),  -- mai/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2022.00088662-71'), 2026,  6,     550.00),  -- jun/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2022.00088662-71'), 2026,  7,     550.00),  -- jul/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2022.00088662-71'), 2026,  8,     550.00),  -- ago/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2022.00088662-71'), 2026,  9,     550.00),  -- set/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2022.00088662-71'), 2026, 10,     550.00),  -- out/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2022.00088662-71'), 2026, 11,     550.00),  -- nov/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2022.00088662-71'), 2026, 12,     550.00);  -- dez/26

--   Cotrans
INSERT INTO pagamentos_contrato (id_contrato, ano, mes, valor) VALUES
  ((SELECT id FROM contratos WHERE sei = 'PMC.2021.00022256-65'), 2026,  1,    8584.34),  -- jan/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2021.00022256-65'), 2026,  2,    8584.34),  -- fev/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2021.00022256-65'), 2026,  3,    8584.34),  -- mar/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2021.00022256-65'), 2026,  4,    8584.34),  -- abr/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2021.00022256-65'), 2026,  5,    8584.34),  -- mai/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2021.00022256-65'), 2026,  6,    8584.34),  -- jun/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2021.00022256-65'), 2026,  7,    8585.00),  -- jul/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2021.00022256-65'), 2026,  8,    8585.00),  -- ago/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2021.00022256-65'), 2026,  9,    8585.00),  -- set/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2021.00022256-65'), 2026, 10,    8585.00),  -- out/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2021.00022256-65'), 2026, 11,    8585.00),  -- nov/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2021.00022256-65'), 2026, 12,    8585.00);  -- dez/26

--   Prime
INSERT INTO pagamentos_contrato (id_contrato, ano, mes, valor) VALUES
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00074029-13'), 2026,  1,  139335.93),  -- jan/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00074029-13'), 2026,  2,   90446.51),  -- fev/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00074029-13'), 2026,  3,  162370.31),  -- mar/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00074029-13'), 2026,  4,  160646.11),  -- abr/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00074029-13'), 2026,  5,  153206.39),  -- mai/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00074029-13'), 2026,  6,  140874.79),  -- jun/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00074029-13'), 2026,  7,  113007.58),  -- jul/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00074029-13'), 2026,  8,   62565.09),  -- ago/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00074029-13'), 2026,  9,  137126.80),  -- set/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00074029-13'), 2026, 10,  137126.80),  -- out/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00074029-13'), 2026, 11,  137126.80),  -- nov/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00074029-13'), 2026, 12,  137126.80);  -- dez/26

--   Cor Line
INSERT INTO pagamentos_contrato (id_contrato, ano, mes, valor) VALUES
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00052484-02'), 2026,  1,    5292.61),  -- jan/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00052484-02'), 2026,  2,   51906.69),  -- fev/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00052484-02'), 2026,  3,   55566.44),  -- mar/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00052484-02'), 2026,  4,   56451.49),  -- abr/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00052484-02'), 2026,  5,   56094.01),  -- mai/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00052484-02'), 2026,  6,   56217.09),  -- jun/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00052484-02'), 2026,  7,   57000.00),  -- jul/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00052484-02'), 2026,  8,   57000.00),  -- ago/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00052484-02'), 2026,  9,   57000.00),  -- set/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00052484-02'), 2026, 10,   57000.00),  -- out/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00052484-02'), 2026, 11,   57000.00),  -- nov/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2023.00052484-02'), 2026, 12,   57000.00);  -- dez/26

--   TIM
INSERT INTO pagamentos_contrato (id_contrato, ano, mes, valor) VALUES
  ((SELECT id FROM contratos WHERE sei = 'PMC.2022.00050814-27'), 2026,  1,    5742.90),  -- jan/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2022.00050814-27'), 2026,  2,    5742.90),  -- fev/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2022.00050814-27'), 2026,  3,    5742.90),  -- mar/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2022.00050814-27'), 2026,  4,    5742.90),  -- abr/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2022.00050814-27'), 2026,  5,    5742.90),  -- mai/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2022.00050814-27'), 2026,  6,    5742.90),  -- jun/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2022.00050814-27'), 2026,  7,    5743.00),  -- jul/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2022.00050814-27'), 2026,  8,    5743.00),  -- ago/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2022.00050814-27'), 2026,  9,    5743.00),  -- set/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2022.00050814-27'), 2026, 10,    5743.00),  -- out/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2022.00050814-27'), 2026, 11,    5743.00),  -- nov/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2022.00050814-27'), 2026, 12,    5743.00);  -- dez/26

--   Viaturas
INSERT INTO pagamentos_contrato (id_contrato, ano, mes, valor) VALUES
  ((SELECT id FROM contratos WHERE sei = 'PMC.2025.00175372-18'), 2026,  1,       NULL),  -- jan/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2025.00175372-18'), 2026,  2,       NULL),  -- fev/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2025.00175372-18'), 2026,  3,       NULL),  -- mar/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2025.00175372-18'), 2026,  4,       NULL),  -- abr/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2025.00175372-18'), 2026,  5,       NULL),  -- mai/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2025.00175372-18'), 2026,  6,       NULL),  -- jun/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2025.00175372-18'), 2026,  7,       NULL),  -- jul/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2025.00175372-18'), 2026,  8,       NULL),  -- ago/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2025.00175372-18'), 2026,  9,       NULL),  -- set/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2025.00175372-18'), 2026, 10,       NULL),  -- out/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2025.00175372-18'), 2026, 11,       NULL),  -- nov/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2025.00175372-18'), 2026, 12,       NULL);  -- dez/26

--   Geo City
INSERT INTO pagamentos_contrato (id_contrato, ano, mes, valor) VALUES
  ((SELECT id FROM contratos WHERE sei = 'PMC.2026.00027617-29'), 2026,  1,       NULL),  -- jan/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2026.00027617-29'), 2026,  2,       NULL),  -- fev/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2026.00027617-29'), 2026,  3,       NULL),  -- mar/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2026.00027617-29'), 2026,  4,       NULL),  -- abr/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2026.00027617-29'), 2026,  5,       NULL),  -- mai/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2026.00027617-29'), 2026,  6,       NULL),  -- jun/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2026.00027617-29'), 2026,  7,       NULL),  -- jul/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2026.00027617-29'), 2026,  8,       NULL),  -- ago/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2026.00027617-29'), 2026,  9,  582050.00),  -- set/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2026.00027617-29'), 2026, 10,  582050.00),  -- out/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2026.00027617-29'), 2026, 11,  582050.00),  -- nov/26
  ((SELECT id FROM contratos WHERE sei = 'PMC.2026.00027617-29'), 2026, 12,  582050.00);  -- dez/26

-- PROCESSOS -------------------------------------------------------------------
-- As linhas abaixo reproduzem a planilha de controle, agrupadas pela fase em
-- que cada processo está. "status" é a anotação livre do que se está fazendo.
--
-- Modalidades registradas na planilha como "AMIL - CONTRATO" e "ARP - SECULT"
-- entraram aqui como AMIL e ARP, que são as opções da lista fechada.

-- ---- CSA · Coordenadoria Setorial Administrativa
INSERT INTO processos (sei, objeto, modalidade, emenda, audesp, pncp, status, prioridade, id_responsavel, id_responsavel_2, etapa, data_limite, id_setor) VALUES
  ('PMC.2026.00130127-81', 'Teste Psicológico', 'CREDENCIAMENTO', 0, NULL, NULL,
   'Pesquisa de Preços até 01/09', 'Baixa', 1, 3, 'CSA', NULL, 5),
  ('PMC.2026.00116139-58', 'Manutenção de Bikes', 'AMIL', 0, NULL, NULL,
   'Orçamento balizador com valor acima do permitido; solicitado novamente em 19/08', 'Média', 2, 4, 'CSA', NULL, 4),
  ('PMC.2026.00132523-16', 'Caixas Herméticas', 'AMIL', 1, NULL, NULL,
   'Aguardando levantamento (CICC)', 'Baixa', 2, NULL, 'CSA', NULL, 2),
  ('PMC.2026.00137508-55', 'Mobiliário', 'AMIL', 1, NULL, NULL,
   'Aguardando definição dos quantitativos', 'Média', 2, NULL, 'CSA', NULL, 3),
  ('PMC.2026.00137514-01', 'Linha Branca', 'AMIL', 1, NULL, NULL,
   'Aguardando definição dos quantitativos', 'Baixa', 2, NULL, 'CSA', NULL, 3),
  ('PMC.2026.00139125-11', 'Marmitex - Refeições Eleições', 'ARP', 0, 'PMC.2024.00074506-59', NULL,
   'NÃO ENVIAR OF', 'Baixa', 1, NULL, 'CSA', NULL, 9);

-- ---- CSF · Coordenadoria Setorial Financeira
INSERT INTO processos (sei, objeto, modalidade, emenda, audesp, pncp, status, prioridade, id_responsavel, id_responsavel_2, etapa, data_limite, id_setor) VALUES
  ('PMC.2023.00015248-98', 'Reajuste CS Frotas', 'Reajuste', 0, NULL, NULL,
   'Em 28/08 Enviado à NFA', 'Média', 2, 3, 'CSF', NULL, 4),
  ('PMC.2026.00048255-46', 'Viatura Duster - PMC.2026.00112533-07', 'Adesão ARP', 1, NULL, NULL,
   'Preencher Formulário para cadastro de emenda', 'Baixa', 1, 3, 'CSF', NULL, 4),
  ('PMC.2025.00103877-17', 'Uniformes Operacionais', 'ARP', 0, NULL, NULL,
   NULL, 'Média', NULL, NULL, 'CSF', NULL, 12);

-- ---- Acompanhamento
INSERT INTO processos (sei, objeto, modalidade, emenda, audesp, pncp, status, prioridade, id_responsavel, id_responsavel_2, etapa, data_limite, id_setor) VALUES
  ('PMC.2026.00052719-19', 'Computadores i5', 'LICITAÇÃO', 1, NULL, NULL,
   'Devolvido ao pregão com correções em 26/08', 'Muito Alta', 1, 5, 'Acompanhamento', NULL, 1),
  ('PMC.2023.00025582-22', 'SABEMI Seguro de Vida', 'PRORROGAÇÃO', 0, NULL, NULL,
   'Enviado à NFA - 02/09', 'Alta', 2, 5, 'Acompanhamento', date('now','+18 days'), 5),
  ('PMC.2025.00145581-92', 'Coturnos', 'ARP', 0, NULL, NULL,
   'Enviado ao Pregão - 21/08', 'Alta', 2, 4, 'Acompanhamento', NULL, 2),
  ('PMC.2025.00186026-84', 'Câmeras e Drones (Monitoramento)', 'ARP', 1, NULL, NULL,
   'Enviado ao Pregão - 21/08', 'Alta', 1, 4, 'Acompanhamento', NULL, 1),
  ('PMC.2026.00148236-19', 'Munição', 'INEX', 1, NULL, NULL,
   'Enviado à SMJ - 02/09', 'Média', 2, 5, 'Acompanhamento', NULL, 2),
  ('PMC.2025.00175372-18', 'Locação de Viaturas', 'LICITAÇÃO', 0, NULL, NULL,
   'Enviado à SMJ - 02/09', 'Alta', 1, 4, 'Acompanhamento', NULL, 4),
  ('PMC.2026.00012545-05', 'Google Workspace', 'AMIL', 0, NULL, NULL,
   'Aguardando NF (Cobrado 28/08)', 'Média', 1, 5, 'Acompanhamento', NULL, 1),
  ('PMC.2025.00013624-81', 'Base Móvel - PMC.2025.00076104-51', 'LICITAÇÃO', 1, NULL, NULL,
   'Aguardando Convênios - NÃO ENVIAR OF', 'Média', 1, 3, 'Acompanhamento', NULL, 11),
  ('PMC.2026.00111058-80', 'Seguro YARIS', 'AMIL', 0, NULL, NULL,
   'OF Enviada - Prazo: 01/10', 'Baixa', 2, NULL, 'Acompanhamento', date('now','+28 days'), 4),
  ('PMC.2026.00030551-27', 'Servidores', 'ARP', 0, NULL, NULL,
   'Aguardando descritivo (CICC)', 'Baixa', 1, 5, 'Acompanhamento', NULL, 1);

-- ---- Execução / Entrega
INSERT INTO processos (sei, objeto, modalidade, emenda, audesp, pncp, status, prioridade, id_responsavel, id_responsavel_2, etapa, data_limite, id_setor) VALUES
  ('PMC.2026.00093892-21', 'Manutenção de Moto', 'AMIL', 0, NULL, NULL,
   'OF Enviada - Prazo: 31/07', 'Alta', 1, 6, 'Execução/Entrega', date('now','-6 days'), 4),
  ('PMC.2026.00124241-72', 'Lâmpada Projetor CICC', 'AMIL', 0, NULL, NULL,
   'OF Enviada - 31/08', 'Baixa', 2, 3, 'Execução/Entrega', NULL, 1);

-- ---- AUDESP / PNCP
INSERT INTO processos (sei, objeto, modalidade, emenda, audesp, pncp, status, prioridade, id_responsavel, id_responsavel_2, etapa, data_limite, id_setor) VALUES
  ('PMC.2026.00043011-21', 'Manutenção Ar-condicionados', 'AMIL', 0, NULL, '46379400600012026',
   'Publicar PNCP e AUDESP', 'Baixa', 2, 5, 'AUDESP/PNCP', date('now','+4 days'), 3),
  ('PMC.2024.00019364-01', 'Prorrogação SENTRY', 'PRORROGAÇÃO', 0, '2025000000192', NULL,
   'AUDESP Publicado', 'Baixa', 2, 5, 'AUDESP/PNCP', NULL, 1),
  ('PMC.2026.00138344-47', 'Iluminadores', 'AMIL', 1, NULL, '46379400600022026',
   'PNCP Publicado', 'Baixa', 2, 5, 'AUDESP/PNCP', NULL, 1);

-- ---- Outros
INSERT INTO processos (sei, objeto, modalidade, emenda, audesp, pncp, status, prioridade, id_responsavel, id_responsavel_2, etapa, data_limite, id_setor) VALUES
  ('PMC.2026.00123915-76', 'Levantamento dos bens inservíveis', NULL, 0, NULL, NULL,
   NULL, 'Baixa', 6, NULL, 'Outros', NULL, 4);

-- ---- Concluídos (vão para a tela de Concluídos, não aparecem na planilha)
INSERT INTO processos (sei, objeto, modalidade, emenda, audesp, pncp, status, prioridade, id_responsavel, id_responsavel_2, etapa, data_limite, data_conclusao, desfecho, id_setor) VALUES
  ('PMC.2026.00118002-11', 'Extrato do contrato CT-009/2026', 'INEX', 0, NULL, '46379400600032025',
   'Publicado e arquivado', 'Média', 1, 5, 'Concluído', date('now','-12 days'), date('now','-14 days'), 'Arquivado', 3),
  ('PMC.2026.00110447-29', 'Curso de reciclagem em uso progressivo da força', 'CREDENCIAMENTO', 0, NULL, NULL,
   'Todas as turmas concluídas', 'Baixa', 4, 6, 'Concluído', date('now','-25 days'), date('now','-28 days'), 'Concluído sem compra', 12),
  ('PMC.2026.00105930-64', 'Uniformes operacionais 2025', 'ARP', 0, NULL, NULL,
   'Entrega conferida e aceita', 'Média', 2, 3, 'Concluído', date('now','-40 days'), date('now','-38 days'), 'Concluído com compra', 12),
  ('PMC.2025.00099120-05', 'Empenho da emenda EP-2025-0902', NULL, 1, '2025000000088', NULL,
   'Empenho concluído', 'Alta', 3, NULL, 'Concluído', date('now','-70 days'), date('now','-73 days'), 'Concluído com compra', 16),
  ('PMC.2026.00101288-37', 'Seguro da frota', 'PRORROGAÇÃO', 0, NULL, NULL,
   'Apólice arquivada', 'Média', 2, 4, 'Concluído', date('now','-55 days'), date('now','-55 days'), 'Concluído sem compra', 4),
  ('PMC.2026.00097745-90', 'Remessa AUDESP do 1º quadrimestre', NULL, 0, '2025000000041', NULL,
   'Recibo arquivado', 'Alta', 3, NULL, 'Concluído', date('now','-90 days'), date('now','-95 days'), 'Arquivado', 7);

-- AQUISICOES ------------------------------------------------------------------
INSERT INTO aquisicoes (item_comprado, quantidade, valor_total, data_compra, id_setor_destino, id_contrato_origem) VALUES
  ('Monitor 55" para o videowall',            12, 74400.00, date('now','-200 days'),  1, NULL),
  ('Rádio comunicador digital',               60, 96000.00, date('now','-185 days'),  4, NULL),
  ('Cadeira de operador 24h',                 40, 38000.00, date('now','-160 days'),  1, NULL),
  ('Ar-condicionado split 12.000 BTUs',       15, 52500.00, date('now','-140 days'), 16, NULL),
  ('Colete balístico nível II-A',            120, 186000.00, date('now','-120 days'), 2, NULL),
  ('Uniforme operacional',                   200,  46000.00, date('now','-95 days'), 12, NULL),
  ('Equipamento não letal — spray de pimenta',150,  27500.00, date('now','-80 days'),  2, NULL),
  ('Pneu para viatura 205/60 R16',            48,  33600.00, date('now','-60 days'),   4, NULL),
  ('Papel A4 (caixa com 10 resmas)',         200,  49000.00, date('now','-45 days'),   3, NULL),
  ('Cone de sinalização refletivo',          150,  12750.00, date('now','-30 days'),  11, NULL),
  ('Câmera corporal (body cam)',              80, 208000.00, date('now','-20 days'),  16, NULL),
  ('Tablet para registro de ocorrência',      25,  47500.00, date('now','-10 days'),  13, NULL);
