// =============================================================================
//  MÓDULO DE TAREFAS PESSOAIS (Estilo Google Tasks)
//  Interface rica inspirada no Google Tasks com quadro de colunas, sub-navegação,
//  gerenciamento de listas, tarefas com estrela, prazos e controle de concluídas.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  FolderPlus,
  GripVertical,
  Layers,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { api, ErroDaApi } from '../lib/api';
import type { DadosAtualizarTarefa, ListaTarefas, Tarefa } from '../lib/types';
import { Botao } from '../components/ui/Botao';
import { Carregando, Falha } from '../components/ui/Estados';
import { Modal } from '../components/ui/Modal';
import { dataBR, diasAte } from '../lib/formato';

type VisaoNavegacao = 'todas' | 'estrela' | 'lista';

export function Tarefas() {
  const [listas, setListas] = useState<ListaTarefas[]>([]);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Navegação e visualização
  const [visao, setVisao] = useState<VisaoNavegacao>('todas');
  const [idListaAtiva, setIdListaAtiva] = useState<number | null>(null);
  // Listas marcadas para exibição no modo de colunas (estilo Google Tasks Desktop)
  const [listasVisiveisNoQuadro, setListasVisiveisNoQuadro] = useState<number[]>([]);
  const [busca, setBusca] = useState('');

  // Formulário rápido inline de criação (guarda qual lista está adicionando)
  const [adicionandoNaLista, setAdicionandoNaLista] = useState<number | null>(null);
  const [novoTitulo, setNovoTitulo] = useState('');
  const [novosDetalhes, setNovosDetalhes] = useState('');
  const [novaData, setNovaData] = useState('');
  const [novaComEstrela, setNovaComEstrela] = useState(false);
  const [salvandoNova, setSalvandoNova] = useState(false);

  // Modais
  const [modalNovaListaAberto, setModalNovaListaAberto] = useState(false);
  const [tituloNovaLista, setTituloNovaLista] = useState('');
  const [salvandoLista, setSalvandoLista] = useState(false);

  const [listaParaRenomear, setListaParaRenomear] = useState<ListaTarefas | null>(null);
  const [tituloRenomear, setTituloRenomear] = useState('');

  const [tarefaEmEdicao, setTarefaEmEdicao] = useState<Tarefa | null>(null);
  const [editTitulo, setEditTitulo] = useState('');
  const [editDetalhes, setEditDetalhes] = useState('');
  const [editData, setEditData] = useState('');
  const [editEstrela, setEditEstrela] = useState(false);
  const [editIdLista, setEditIdLista] = useState<number>(0);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  // Controle de colapso de tarefas concluídas por lista (id_lista -> boolean)
  const [concluidasAbertas, setConcluidasAbertas] = useState<Record<number, boolean>>({});

  // Menu suspenso de ações da lista (id_lista -> boolean)
  const [menuListaAberto, setMenuListaAberto] = useState<number | null>(null);

  // Drag and Drop de tarefas entre colunas
  const [tarefaArrastadaId, setTarefaArrastadaId] = useState<number | null>(null);
  const [colunaHoverId, setColunaHoverId] = useState<number | null>(null);

  // Notificações rápidas (Toast)
  const [aviso, setAviso] = useState<{ texto: string; erro?: boolean } | null>(null);

  const mostrarAviso = useCallback((texto: string, erro = false) => {
    setAviso({ texto, erro });
    setTimeout(() => {
      setAviso((atual) => (atual?.texto === texto ? null : atual));
    }, 3500);
  }, []);

  // Mover tarefa entre listas / colunas (Drag and Drop)
  const moverTarefaParaLista = async (idTarefa: number, idDestino: number) => {
    const tarefa = tarefas.find((t) => t.id === idTarefa);
    if (!tarefa || tarefa.id_lista === idDestino) return;

    const listaDestino = listas.find((l) => l.id === idDestino);
    if (!listaDestino) return;

    const idOrigem = tarefa.id_lista;
    const statusConcluida = tarefa.concluida;

    // Atualização otimista imediata na lista de tarefas
    setTarefas((prev) =>
      prev.map((t) =>
        t.id === idTarefa
          ? { ...t, id_lista: idDestino, lista_titulo: listaDestino.titulo }
          : t,
      ),
    );

    // Atualização otimista dos contadores nas listas
    setListas((prev) =>
      prev.map((l) => {
        if (l.id === idOrigem) {
          return {
            ...l,
            total_pendentes: statusConcluida === 0 ? l.total_pendentes - 1 : l.total_pendentes,
            total_concluidas: statusConcluida === 1 ? l.total_concluidas - 1 : l.total_concluidas,
          };
        }
        if (l.id === idDestino) {
          return {
            ...l,
            total_pendentes: statusConcluida === 0 ? l.total_pendentes + 1 : l.total_pendentes,
            total_concluidas: statusConcluida === 1 ? l.total_concluidas + 1 : l.total_concluidas,
          };
        }
        return l;
      }),
    );

    mostrarAviso(`Tarefa movida para "${listaDestino.titulo}"`);

    try {
      await api.tarefas.ajustar(idTarefa, { id_lista: idDestino });
    } catch {
      mostrarAviso('Erro ao mover a tarefa.', true);
      carregarDados();
    }
  };

  // Carrega listas e tarefas do usuário autenticado
  const carregarDados = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [todasListas, todasTarefas] = await Promise.all([
        api.tarefas.listarListas(),
        api.tarefas.listar(),
      ]);
      setListas(todasListas);
      setTarefas(todasTarefas);

      // Se não havia listas visíveis selecionadas, marca todas por padrão
      setListasVisiveisNoQuadro((atuais) => {
        if (atuais.length > 0) return atuais;
        return todasListas.map((l) => l.id);
      });

      if (!idListaAtiva && todasListas.length > 0) {
        setIdListaAtiva(todasListas[0].id);
      }
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível carregar as tarefas.');
    } finally {
      setCarregando(false);
    }
  }, [idListaAtiva]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  // Contadores gerais
  const totalPendentesGeral = useMemo(
    () => tarefas.filter((t) => t.concluida === 0).length,
    [tarefas],
  );
  const totalComEstrela = useMemo(
    () => tarefas.filter((t) => t.com_estrela === 1 && t.concluida === 0).length,
    [tarefas],
  );

  // Alterna visibilidade da lista no quadro
  const alternarVisibilidadeLista = (id: number) => {
    setListasVisiveisNoQuadro((atuais) => {
      if (atuais.includes(id)) {
        if (atuais.length === 1) {
          mostrarAviso('Mantenha ao menos uma lista visível.', true);
          return atuais;
        }
        return atuais.filter((item) => item !== id);
      }
      return [...atuais, id];
    });
  };

  // Alternar conclusão de tarefa (otimista)
  const alternarConclusao = async (tarefa: Tarefa) => {
    const novoStatus = tarefa.concluida === 1 ? 0 : 1;
    const antigaLista = [...tarefas];

    // Atualização otimista imediata na UI
    setTarefas((prev) =>
      prev.map((t) =>
        t.id === tarefa.id
          ? {
              ...t,
              concluida: novoStatus,
              concluida_em: novoStatus === 1 ? new Date().toISOString() : null,
            }
          : t,
      ),
    );

    // Atualiza contadores locais das listas
    setListas((prev) =>
      prev.map((l) => {
        if (l.id === tarefa.id_lista) {
          return {
            ...l,
            total_pendentes: l.total_pendentes + (novoStatus === 1 ? -1 : 1),
            total_concluidas: l.total_concluidas + (novoStatus === 1 ? 1 : -1),
          };
        }
        return l;
      }),
    );

    if (novoStatus === 1) {
      mostrarAviso('Tarefa concluída!');
    }

    try {
      await api.tarefas.ajustar(tarefa.id, { concluida: novoStatus === 1 });
    } catch {
      setTarefas(antigaLista);
      mostrarAviso('Erro ao atualizar a tarefa.', true);
    }
  };

  // Alternar estrela (otimista)
  const alternarEstrela = async (tarefa: Tarefa) => {
    const novaEstrela = tarefa.com_estrela === 1 ? 0 : 1;
    setTarefas((prev) =>
      prev.map((t) => (t.id === tarefa.id ? { ...t, com_estrela: novaEstrela } : t)),
    );

    try {
      await api.tarefas.ajustar(tarefa.id, { com_estrela: novaEstrela === 1 });
    } catch {
      mostrarAviso('Não foi possível atualizar a estrela.', true);
      setTarefas((prev) =>
        prev.map((t) => (t.id === tarefa.id ? { ...t, com_estrela: tarefa.com_estrela } : t)),
      );
    }
  };

  // Excluir tarefa
  const excluirTarefa = async (id: number, idLista: number) => {
    const tarefaParaRemover = tarefas.find((t) => t.id === id);
    if (!tarefaParaRemover) return;

    setTarefas((prev) => prev.filter((t) => t.id !== id));
    setListas((prev) =>
      prev.map((l) => {
        if (l.id === idLista) {
          return {
            ...l,
            total_pendentes:
              tarefaParaRemover.concluida === 0 ? l.total_pendentes - 1 : l.total_pendentes,
            total_concluidas:
              tarefaParaRemover.concluida === 1 ? l.total_concluidas - 1 : l.total_concluidas,
          };
        }
        return l;
      }),
    );

    try {
      await api.tarefas.excluir(id);
      mostrarAviso('Tarefa excluída.');
    } catch {
      mostrarAviso('Erro ao excluir tarefa.', true);
      carregarDados();
    }
  };

  // Salvar nova tarefa
  const salvarNovaTarefa = async (idLista: number) => {
    const tituloLimpo = novoTitulo.trim();
    if (!tituloLimpo) return;

    setSalvandoNova(true);
    try {
      const criada = await api.tarefas.criar({
        id_lista: idLista,
        titulo: tituloLimpo,
        detalhes: novosDetalhes.trim() || null,
        data_vencimento: novaData || null,
        com_estrela: novaComEstrela,
      });

      setTarefas((prev) => [criada, ...prev]);
      setListas((prev) =>
        prev.map((l) => (l.id === idLista ? { ...l, total_pendentes: l.total_pendentes + 1 } : l)),
      );

      // Limpa formulário
      setNovoTitulo('');
      setNovosDetalhes('');
      setNovaData('');
      setNovaComEstrela(false);
      setAdicionandoNaLista(null);
      mostrarAviso('Tarefa adicionada!');
    } catch (e) {
      mostrarAviso(e instanceof ErroDaApi ? e.message : 'Erro ao criar tarefa.', true);
    } finally {
      setSalvandoNova(false);
    }
  };

  // Criar nova lista
  const handleCriarLista = async () => {
    const tituloLimpo = tituloNovaLista.trim();
    if (!tituloLimpo) return;

    setSalvandoLista(true);
    try {
      const nova = await api.tarefas.criarLista(tituloLimpo);
      setListas((prev) => [...prev, nova]);
      setListasVisiveisNoQuadro((prev) => [...prev, nova.id]);
      setIdListaAtiva(nova.id);
      setVisao('lista');
      setTituloNovaLista('');
      setModalNovaListaAberto(false);
      mostrarAviso(`Lista "${nova.titulo}" criada com sucesso!`);
    } catch (e) {
      mostrarAviso(e instanceof ErroDaApi ? e.message : 'Erro ao criar lista.', true);
    } finally {
      setSalvandoLista(false);
    }
  };

  // Renomear lista
  const handleRenomearLista = async () => {
    if (!listaParaRenomear) return;
    const tituloLimpo = tituloRenomear.trim();
    if (!tituloLimpo) return;

    try {
      const atualizada = await api.tarefas.alterarLista(listaParaRenomear.id, {
        titulo: tituloLimpo,
      });
      setListas((prev) => prev.map((l) => (l.id === atualizada.id ? { ...l, titulo: atualizada.titulo } : l)));
      setTarefas((prev) =>
        prev.map((t) => (t.id_lista === atualizada.id ? { ...t, lista_titulo: atualizada.titulo } : t)),
      );
      setListaParaRenomear(null);
      mostrarAviso('Lista renomeada!');
    } catch (e) {
      mostrarAviso(e instanceof ErroDaApi ? e.message : 'Erro ao renomear lista.', true);
    }
  };

  // Excluir lista
  const handleExcluirLista = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir esta lista e todas as tarefas dentro dela?')) {
      return;
    }

    try {
      await api.tarefas.excluirLista(id);
      setListas((prev) => prev.filter((l) => l.id !== id));
      setTarefas((prev) => prev.filter((t) => t.id_lista !== id));
      setListasVisiveisNoQuadro((prev) => prev.filter((item) => item !== id));
      if (idListaAtiva === id) {
        setIdListaAtiva(null);
        setVisao('todas');
      }
      mostrarAviso('Lista excluída.');
    } catch (e) {
      mostrarAviso(e instanceof ErroDaApi ? e.message : 'Não foi possível excluir a lista.', true);
    }
  };

  // Limpar concluídas da lista
  const handleLimparConcluidas = async (idLista: number) => {
    try {
      await api.tarefas.limparConcluidas(idLista);
      setTarefas((prev) => prev.filter((t) => !(t.id_lista === idLista && t.concluida === 1)));
      setListas((prev) =>
        prev.map((l) => (l.id === idLista ? { ...l, total_concluidas: 0 } : l)),
      );
      mostrarAviso('Tarefas concluídas removidas.');
    } catch (e) {
      mostrarAviso(e instanceof ErroDaApi ? e.message : 'Erro ao limpar tarefas.', true);
    }
  };

  // Abrir modal de edição de tarefa
  const abrirEdicaoTarefa = (tarefa: Tarefa) => {
    setTarefaEmEdicao(tarefa);
    setEditTitulo(tarefa.titulo);
    setEditDetalhes(tarefa.detalhes ?? '');
    setEditData(tarefa.data_vencimento ? tarefa.data_vencimento.slice(0, 10) : '');
    setEditEstrela(tarefa.com_estrela === 1);
    setEditIdLista(tarefa.id_lista);
  };

  // Salvar edição da tarefa
  const handleSalvarEdicao = async () => {
    if (!tarefaEmEdicao) return;
    const tituloLimpo = editTitulo.trim();
    if (!tituloLimpo) return;

    setSalvandoEdicao(true);
    const alteracoes: DadosAtualizarTarefa = {
      titulo: tituloLimpo,
      detalhes: editDetalhes.trim() || null,
      data_vencimento: editData || null,
      com_estrela: editEstrela,
      id_lista: editIdLista,
    };

    try {
      const atualizada = await api.tarefas.ajustar(tarefaEmEdicao.id, alteracoes);
      setTarefas((prev) =>
        prev.map((t) => (t.id === atualizada.id ? { ...t, ...atualizada } : t)),
      );

      // Se mudou de lista, recalcula os contadores locais
      if (tarefaEmEdicao.id_lista !== editIdLista) {
        setListas((prev) =>
          prev.map((l) => {
            if (l.id === tarefaEmEdicao.id_lista) {
              return {
                ...l,
                total_pendentes:
                  tarefaEmEdicao.concluida === 0 ? l.total_pendentes - 1 : l.total_pendentes,
                total_concluidas:
                  tarefaEmEdicao.concluida === 1 ? l.total_concluidas - 1 : l.total_concluidas,
              };
            }
            if (l.id === editIdLista) {
              return {
                ...l,
                total_pendentes:
                  tarefaEmEdicao.concluida === 0 ? l.total_pendentes + 1 : l.total_pendentes,
                total_concluidas:
                  tarefaEmEdicao.concluida === 1 ? l.total_concluidas + 1 : l.total_concluidas,
              };
            }
            return l;
          }),
        );
      }

      setTarefaEmEdicao(null);
      mostrarAviso('Tarefa atualizada com sucesso!');
    } catch (e) {
      mostrarAviso(e instanceof ErroDaApi ? e.message : 'Erro ao salvar alterações.', true);
    } finally {
      setSalvandoEdicao(false);
    }
  };

  // Filtro de texto da busca
  const filtrarTarefasPorBusca = (listaDeTarefas: Tarefa[]) => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return listaDeTarefas;
    return listaDeTarefas.filter(
      (t) =>
        t.titulo.toLowerCase().includes(termo) ||
        (t.detalhes && t.detalhes.toLowerCase().includes(termo)) ||
        (t.lista_titulo && t.lista_titulo.toLowerCase().includes(termo)),
    );
  };

  // Listas que devem ser renderizadas como colunas
  const listasParaExibir = useMemo(() => {
    if (visao === 'lista') {
      return listas.filter((l) => l.id === idListaAtiva);
    }
    // No modo 'todas' e 'estrela', respeita a seleção de visibilidade no quadro
    return listas.filter((l) => listasVisiveisNoQuadro.includes(l.id));
  }, [visao, idListaAtiva, listas, listasVisiveisNoQuadro]);

  if (carregando) {
    return <Carregando texto="Carregando tarefas..." />;
  }

  if (erro) {
    return <Falha mensagem={erro} aoTentarDeNovo={carregarDados} />;
  }

  return (
    <div className="flex h-[calc(100vh-8.5rem)] flex-col gap-4">
      {/* Toast de notificação flutuante */}
      {aviso && (
        <div
          role="status"
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium shadow-lg transition-all
            ${
              aviso.erro
                ? 'border border-red-200 bg-red-600 text-white'
                : 'border border-slate-700 bg-slate-900 text-white'
            }`}
        >
          {aviso.erro ? <X className="size-4" /> : <Check className="size-4 text-emerald-400" />}
          <span>{aviso.texto}</span>
        </div>
      )}

      {/* Barra superior de ações e busca */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-marca-50 text-marca-600">
            <CheckCircle2 className="size-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Minhas Tarefas</h2>
            <p className="text-xs text-slate-500">
              {totalPendentesGeral === 0
                ? 'Tudo em dia! Nenhuma tarefa pendente.'
                : `${totalPendentesGeral} ${totalPendentesGeral === 1 ? 'tarefa pendente' : 'tarefas pendentes'}`}
            </p>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-end gap-3 max-sm:w-full">
          {/* Campo de pesquisa */}
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Pesquisar tarefas..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-800 placeholder-slate-400 transition-colors focus:border-marca-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-marca-100"
            />
            {busca && (
              <button
                type="button"
                onClick={() => setBusca('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <Botao
            aparencia="primario"
            icone={<Plus className="size-4" />}
            onClick={() => {
              // Se há listas, abre o formulário da primeira visível ou padrão
              const listaAlvo = listasParaExibir[0] ?? listas[0];
              if (listaAlvo) {
                setAdicionandoNaLista(listaAlvo.id);
                setNovoTitulo('');
              }
            }}
          >
            Nova tarefa
          </Botao>
        </div>
      </div>

      {/* Layout principal: Menu lateral de listas (estilo Google Tasks) + Quadro de colunas */}
      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Painel lateral interno de listas */}
        <aside className="flex w-64 shrink-0 flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xs max-md:hidden">
          {/* Botão + Criar estilo Google Tasks */}
          <button
            type="button"
            onClick={() => {
              const listaAlvo = listasParaExibir[0] ?? listas[0];
              if (listaAlvo) {
                setAdicionandoNaLista(listaAlvo.id);
                setNovoTitulo('');
              }
            }}
            className="flex items-center gap-3 rounded-2xl bg-marca-50 px-4 py-3 font-semibold text-marca-700 transition hover:bg-marca-100 active:scale-95"
          >
            <Plus className="size-5 text-marca-600" />
            <span>Criar tarefa</span>
          </button>

          {/* Vistas especiais */}
          <div className="flex flex-col gap-1 border-b border-slate-100 pb-3">
            <button
              type="button"
              onClick={() => {
                setVisao('todas');
                setIdListaAtiva(null);
              }}
              className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                visao === 'todas'
                  ? 'bg-marca-600 text-white shadow-xs'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Layers className="size-4" />
                <span>Todas as tarefas</span>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                  visao === 'todas'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {totalPendentesGeral}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setVisao('estrela');
                setIdListaAtiva(null);
              }}
              className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                visao === 'estrela'
                  ? 'bg-marca-600 text-white shadow-xs'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Star
                  className={`size-4 ${visao === 'estrela' ? 'fill-current text-white' : 'fill-amber-400 text-amber-500'}`}
                />
                <span>Com estrela</span>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                  visao === 'estrela'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {totalComEstrela}
              </span>
            </button>
          </div>

          {/* Seção de Listas (com checkboxes de visibilidade no quadro estilo Google Tasks) */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="mb-2 flex items-center justify-between px-2 pt-1 text-xs font-bold uppercase tracking-wider text-slate-400">
              <span>Listas</span>
              <span className="text-[11px] font-normal lowercase text-slate-400">
                (marque para exibir)
              </span>
            </div>

            <div className="flex-1 space-y-1 overflow-y-auto pr-1">
              {listas.map((l) => {
                const visivel = listasVisiveisNoQuadro.includes(l.id);
                const selecionadaUnica = visao === 'lista' && idListaAtiva === l.id;

                return (
                  <div
                    key={l.id}
                    className={`group flex items-center justify-between rounded-xl px-2 py-1.5 transition ${
                      selecionadaUnica
                        ? 'bg-marca-50 text-marca-900'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      {/* Checkbox para alternar coluna visível */}
                      <input
                        type="checkbox"
                        checked={visivel}
                        onChange={() => alternarVisibilidadeLista(l.id)}
                        title="Exibir como coluna no quadro"
                        className="size-4 cursor-pointer rounded text-marca-600 focus:ring-marca-500"
                      />

                      {/* Clique no nome foca a lista ou entra no modo focado */}
                      <button
                        type="button"
                        onClick={() => {
                          setVisao('lista');
                          setIdListaAtiva(l.id);
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="block truncate text-sm font-medium">{l.titulo}</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      {l.total_pendentes > 0 && (
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                          {l.total_pendentes}
                        </span>
                      )}

                      {/* Botão de menu da lista */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setListaParaRenomear(l);
                          setTituloRenomear(l.titulo);
                        }}
                        title="Renomear lista"
                        className="opacity-0 transition-opacity hover:text-marca-600 group-hover:opacity-100"
                      >
                        <Pencil className="size-3.5" />
                      </button>

                      {listas.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExcluirLista(l.id);
                          }}
                          title="Excluir lista"
                          className="opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* + Criar nova lista */}
            <button
              type="button"
              onClick={() => {
                setTituloNovaLista('');
                setModalNovaListaAberto(true);
              }}
              className="mt-2 flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-marca-500 hover:bg-marca-50 hover:text-marca-700"
            >
              <FolderPlus className="size-4" />
              <span>Criar nova lista</span>
            </button>
          </div>
        </aside>

        {/* Área Principal: Quadro de Colunas de Tarefas */}
        <main className="flex flex-1 gap-4 overflow-x-auto pb-2">
          {listasParaExibir.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <CheckCircle2 className="size-12 text-slate-300" />
              <p className="mt-3 text-base font-semibold text-slate-700">
                Nenhuma lista selecionada
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Marque uma ou mais listas no painel à esquerda para visualizá-las no quadro.
              </p>
              <Botao
                aparencia="primario"
                className="mt-4"
                onClick={() => setListasVisiveisNoQuadro(listas.map((l) => l.id))}
              >
                Exibir todas as listas
              </Botao>
            </div>
          ) : (
            listasParaExibir.map((lista) => {
              // Tarefas desta lista
              let tarefasDaLista = tarefas.filter((t) => t.id_lista === lista.id);

              if (visao === 'estrela') {
                tarefasDaLista = tarefasDaLista.filter((t) => t.com_estrela === 1);
              }

              tarefasDaLista = filtrarTarefasPorBusca(tarefasDaLista);

              const pendentes = tarefasDaLista.filter((t) => t.concluida === 0);
              const concluidas = tarefasDaLista.filter((t) => t.concluida === 1);
              const mostrarConcluidas = !!concluidasAbertas[lista.id];
              const estaAdicionando = adicionandoNaLista === lista.id;
              const estaComDragOver = colunaHoverId === lista.id && tarefaArrastadaId !== null;

              return (
                <div
                  key={lista.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (colunaHoverId !== lista.id) {
                      setColunaHoverId(lista.id);
                    }
                  }}
                  onDragLeave={(e) => {
                    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                    if (colunaHoverId === lista.id) {
                      setColunaHoverId(null);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const rawId = e.dataTransfer.getData('text/plain');
                    const idTarefa = Number(rawId) || tarefaArrastadaId;
                    if (idTarefa) {
                      moverTarefaParaLista(idTarefa, lista.id);
                    }
                    setTarefaArrastadaId(null);
                    setColunaHoverId(null);
                  }}
                  className={`flex w-84 shrink-0 flex-col rounded-2xl border transition-all duration-150 ${
                    estaComDragOver
                      ? 'border-marca-500 bg-marca-50/20 shadow-md ring-2 ring-marca-300'
                      : 'border-slate-200/90 bg-white shadow-xs'
                  }`}
                >
                  {/* Cabeçalho da Coluna / Lista */}
                  <div className="relative flex items-center justify-between border-b border-slate-100 p-3.5">
                    <div className="min-w-0">
                      <h3 className="truncate font-bold text-slate-900">{lista.titulo}</h3>
                      <p className="text-xs text-slate-400">
                        {pendentes.length} {pendentes.length === 1 ? 'pendente' : 'pendentes'}
                      </p>
                    </div>

                    <div className="relative">
                      <button
                        type="button"
                        onClick={() =>
                          setMenuListaAberto(menuListaAberto === lista.id ? null : lista.id)
                        }
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        title="Opções da lista"
                      >
                        <MoreVertical className="size-4" />
                      </button>

                      {menuListaAberto === lista.id && (
                        <>
                          <div
                            className="fixed inset-0 z-20"
                            onClick={() => setMenuListaAberto(null)}
                          />
                          <div className="absolute right-0 top-8 z-30 w-48 rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg">
                            <button
                              type="button"
                              onClick={() => {
                                setMenuListaAberto(null);
                                setListaParaRenomear(lista);
                                setTituloRenomear(lista.titulo);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              <Pencil className="size-3.5 text-slate-400" />
                              <span>Renomear lista</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setMenuListaAberto(null);
                                handleLimparConcluidas(lista.id);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              <Check className="size-3.5 text-slate-400" />
                              <span>Limpar concluídas</span>
                            </button>

                            {listas.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setMenuListaAberto(null);
                                  handleExcluirLista(lista.id);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="size-3.5 text-red-400" />
                                <span>Excluir lista</span>
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Botão / Formulário "+ Adicionar uma tarefa" no topo da lista */}
                  <div className="p-3">
                    {estaAdicionando ? (
                      <div className="rounded-xl border border-marca-300 bg-marca-50/30 p-3 shadow-xs">
                        <input
                          type="text"
                          autoFocus
                          value={novoTitulo}
                          onChange={(e) => setNovoTitulo(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') salvarNovaTarefa(lista.id);
                            if (e.key === 'Escape') setAdicionandoNaLista(null);
                          }}
                          placeholder="Título da tarefa..."
                          className="w-full bg-transparent text-sm font-semibold text-slate-900 placeholder-slate-400 focus:outline-none"
                        />

                        <textarea
                          rows={2}
                          value={novosDetalhes}
                          onChange={(e) => setNovosDetalhes(e.target.value)}
                          placeholder="Adicionar detalhes (opcional)"
                          className="mt-2 w-full resize-none bg-transparent text-xs text-slate-700 placeholder-slate-400 focus:outline-none"
                        />

                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/60 pt-2">
                          <div className="flex items-center gap-2">
                            {/* Data de vencimento */}
                            <label className="flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">
                              <Calendar className="size-3.5 text-slate-400" />
                              <input
                                type="date"
                                value={novaData}
                                onChange={(e) => setNovaData(e.target.value)}
                                className="cursor-pointer bg-transparent text-xs text-slate-700 focus:outline-none"
                              />
                            </label>

                            {/* Estrela */}
                            <button
                              type="button"
                              onClick={() => setNovaComEstrela(!novaComEstrela)}
                              title={novaComEstrela ? 'Remover estrela' : 'Marcar com estrela'}
                              className={`rounded-lg border p-1.5 transition ${
                                novaComEstrela
                                  ? 'border-amber-300 bg-amber-50 text-amber-500'
                                  : 'border-slate-200 bg-white text-slate-400 hover:text-slate-600'
                              }`}
                            >
                              <Star
                                className={`size-3.5 ${novaComEstrela ? 'fill-current' : ''}`}
                              />
                            </button>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setAdicionandoNaLista(null)}
                              className="rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                            >
                              Cancelar
                            </button>
                            <Botao
                              aparencia="primario"
                              className="!px-3 !py-1 !text-xs"
                              carregando={salvandoNova}
                              disabled={!novoTitulo.trim()}
                              onClick={() => salvarNovaTarefa(lista.id)}
                            >
                              Salvar
                            </Botao>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setAdicionandoNaLista(lista.id);
                          setNovoTitulo('');
                          setNovosDetalhes('');
                          setNovaData('');
                          setNovaComEstrela(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-xl border border-dashed border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 transition hover:border-marca-400 hover:bg-marca-50 hover:text-marca-700"
                      >
                        <Plus className="size-4" />
                        <span>Adicionar uma tarefa</span>
                      </button>
                    )}
                  </div>

                  {/* Corpo rolável com tarefas da lista */}
                  <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-3">
                    {/* Alvo visual quando arrastando tarefa sobre a coluna */}
                    {estaComDragOver && (
                      <div className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-marca-400 bg-marca-100/60 py-3 text-xs font-bold text-marca-700 animate-pulse shadow-xs">
                        <span>Solte a tarefa para mover para "{lista.titulo}"</span>
                      </div>
                    )}

                    {/* Lista vazia de pendentes (Ilustração estilo Google Tasks) */}
                    {pendentes.length === 0 && !estaAdicionando && (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <div className="flex size-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-500 ring-8 ring-emerald-50/40">
                          <Sparkles className="size-7" />
                        </div>
                        <p className="mt-3 text-sm font-bold text-slate-800">
                          Todas as tarefas concluídas
                        </p>
                        <p className="text-xs text-slate-400">Bom trabalho!</p>
                      </div>
                    )}

                    {/* Itens pendentes */}
                    {pendentes.map((t) => {
                      const diasRestantes = diasAte(t.data_vencimento);
                      const atrasada = diasRestantes !== null && diasRestantes < 0;
                      const hoje = diasRestantes === 0;
                      const estaArrastando = tarefaArrastadaId === t.id;

                      return (
                        <div
                          key={t.id}
                          draggable={true}
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', String(t.id));
                            e.dataTransfer.effectAllowed = 'move';
                            setTarefaArrastadaId(t.id);
                          }}
                          onDragEnd={() => {
                            setTarefaArrastadaId(null);
                            setColunaHoverId(null);
                          }}
                          className={`group relative flex items-start gap-2 rounded-xl border bg-white p-3 shadow-xs transition cursor-grab active:cursor-grabbing ${
                            estaArrastando
                              ? 'opacity-40 border-marca-400 scale-[0.98] ring-2 ring-marca-200'
                              : 'border-slate-100 hover:border-slate-200 hover:shadow-sm'
                          }`}
                        >
                          {/* Alça visual de arrastar */}
                          <div
                            className="mt-0.5 cursor-grab text-slate-300 opacity-25 transition-opacity group-hover:opacity-100 hover:text-slate-600"
                            title="Arraste para mover entre colunas"
                          >
                            <GripVertical className="size-4" />
                          </div>

                          {/* Botão de Conclusão Circular */}
                          <button
                            type="button"
                            onClick={() => alternarConclusao(t)}
                            title="Concluir tarefa"
                            className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 text-transparent transition hover:border-marca-600 hover:bg-marca-50 hover:text-marca-600 active:scale-90"
                          >
                            <Circle className="size-3 fill-current" />
                          </button>

                          {/* Conteúdo da tarefa (clique para abrir modal de edição) */}
                          <div
                            className="min-w-0 flex-1 cursor-pointer"
                            onClick={() => abrirEdicaoTarefa(t)}
                          >
                            <p className="text-sm font-semibold text-slate-800 group-hover:text-marca-700">
                              {t.titulo}
                            </p>

                            {t.detalhes && (
                              <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                                {t.detalhes}
                              </p>
                            )}

                            {t.data_vencimento && (
                              <div className="mt-2 flex items-center gap-1">
                                <span
                                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                                    atrasada
                                      ? 'bg-red-50 text-red-600'
                                      : hoje
                                        ? 'bg-amber-50 text-amber-600'
                                        : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  <Calendar className="size-3" />
                                  <span>{dataBR(t.data_vencimento)}</span>
                                  {atrasada && <span>(atrasada)</span>}
                                  {hoje && <span>(hoje)</span>}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Ações da tarefa: Estrela e Exclusão */}
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => alternarEstrela(t)}
                              title={t.com_estrela ? 'Remover estrela' : 'Adicionar estrela'}
                              className={`rounded p-1 transition ${
                                t.com_estrela
                                  ? 'text-amber-500 hover:text-amber-600'
                                  : 'text-slate-300 opacity-0 group-hover:opacity-100 hover:text-slate-500'
                              }`}
                            >
                              <Star
                                className={`size-4 ${t.com_estrela ? 'fill-current' : ''}`}
                              />
                            </button>

                            <button
                              type="button"
                              onClick={() => excluirTarefa(t.id, t.id_lista)}
                              title="Excluir tarefa"
                              className="rounded p-1 text-slate-300 opacity-0 transition group-hover:opacity-100 hover:text-red-600"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {/* Seção retrátil de Tarefas Concluídas */}
                    {concluidas.length > 0 && (
                      <div className="mt-4 border-t border-slate-100 pt-2">
                        <button
                          type="button"
                          onClick={() =>
                            setConcluidasAbertas((prev) => ({
                              ...prev,
                              [lista.id]: !mostrarConcluidas,
                            }))
                          }
                          className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                        >
                          <div className="flex items-center gap-1.5">
                            {mostrarConcluidas ? (
                              <ChevronDown className="size-3.5" />
                            ) : (
                              <ChevronRight className="size-3.5" />
                            )}
                            <span>Concluídas ({concluidas.length})</span>
                          </div>
                        </button>

                        {mostrarConcluidas && (
                          <div className="mt-2 space-y-1.5">
                            {concluidas.map((t) => {
                              const estaArrastando = tarefaArrastadaId === t.id;
                              return (
                                <div
                                  key={t.id}
                                  draggable={true}
                                  onDragStart={(e) => {
                                    e.dataTransfer.setData('text/plain', String(t.id));
                                    e.dataTransfer.effectAllowed = 'move';
                                    setTarefaArrastadaId(t.id);
                                  }}
                                  onDragEnd={() => {
                                    setTarefaArrastadaId(null);
                                    setColunaHoverId(null);
                                  }}
                                  className={`group flex items-start gap-2 rounded-xl bg-slate-50/70 p-2.5 transition hover:bg-slate-100/70 cursor-grab active:cursor-grabbing ${
                                    estaArrastando ? 'opacity-40 border border-marca-300' : ''
                                  }`}
                                >
                                  <div
                                    className="mt-0.5 cursor-grab text-slate-300 opacity-20 transition-opacity group-hover:opacity-100 hover:text-slate-600"
                                    title="Arraste para mover entre colunas"
                                  >
                                    <GripVertical className="size-3.5" />
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => alternarConclusao(t)}
                                    title="Reabrir tarefa"
                                    className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-marca-600 text-white transition hover:bg-slate-400 active:scale-90"
                                  >
                                    <Check className="size-3 stroke-[3]" />
                                  </button>

                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-slate-400 line-through">
                                      {t.titulo}
                                    </p>
                                    {t.detalhes && (
                                      <p className="mt-0.5 line-clamp-1 text-xs text-slate-400 line-through">
                                        {t.detalhes}
                                      </p>
                                    )}
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => excluirTarefa(t.id, t.id_lista)}
                                    title="Excluir permanentemente"
                                    className="rounded p-1 text-slate-300 opacity-0 transition group-hover:opacity-100 hover:text-red-600"
                                  >
                                    <Trash2 className="size-3.5" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </main>
      </div>

      {/* MODAL: Nova Lista */}
      <Modal
        aberto={modalNovaListaAberto}
        aoFechar={() => setModalNovaListaAberto(false)}
        titulo="Criar nova lista"
        descricao="Organize suas tarefas por projeto, área ou contexto."
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Título da lista
            </label>
            <input
              type="text"
              autoFocus
              value={tituloNovaLista}
              onChange={(e) => setTituloNovaLista(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCriarLista();
              }}
              placeholder="Ex.: Licitações do Mês, Pessoal, Urgente..."
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-marca-500 focus:outline-none focus:ring-4 focus:ring-marca-100"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Botao
              aparencia="neutro"
              onClick={() => setModalNovaListaAberto(false)}
            >
              Cancelar
            </Botao>
            <Botao
              aparencia="primario"
              carregando={salvandoLista}
              disabled={!tituloNovaLista.trim()}
              onClick={handleCriarLista}
            >
              Criar lista
            </Botao>
          </div>
        </div>
      </Modal>

      {/* MODAL: Renomear Lista */}
      <Modal
        aberto={!!listaParaRenomear}
        aoFechar={() => setListaParaRenomear(null)}
        titulo="Renomear lista"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Nome da lista
            </label>
            <input
              type="text"
              autoFocus
              value={tituloRenomear}
              onChange={(e) => setTituloRenomear(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenomearLista();
              }}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-marca-500 focus:outline-none focus:ring-4 focus:ring-marca-100"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Botao aparencia="neutro" onClick={() => setListaParaRenomear(null)}>
              Cancelar
            </Botao>
            <Botao
              aparencia="primario"
              disabled={!tituloRenomear.trim()}
              onClick={handleRenomearLista}
            >
              Salvar
            </Botao>
          </div>
        </div>
      </Modal>

      {/* MODAL: Detalhes e Edição da Tarefa */}
      <Modal
        aberto={!!tarefaEmEdicao}
        aoFechar={() => setTarefaEmEdicao(null)}
        titulo="Editar tarefa"
        descricao="Altere o título, anotações, lista ou data de vencimento."
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Título da tarefa *
            </label>
            <input
              type="text"
              autoFocus
              value={editTitulo}
              onChange={(e) => setEditTitulo(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900 focus:border-marca-500 focus:outline-none focus:ring-4 focus:ring-marca-100"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Detalhes / Anotações
            </label>
            <textarea
              rows={3}
              value={editDetalhes}
              onChange={(e) => setEditDetalhes(e.target.value)}
              placeholder="Adicione observações, links ou anotações..."
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-marca-500 focus:outline-none focus:ring-4 focus:ring-marca-100"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Lista
              </label>
              <select
                value={editIdLista}
                onChange={(e) => setEditIdLista(Number(e.target.value))}
                className="mt-1 w-full cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-marca-500 focus:outline-none focus:ring-4 focus:ring-marca-100"
              >
                {listas.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.titulo}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Data de vencimento
              </label>
              <input
                type="date"
                value={editData}
                onChange={(e) => setEditData(e.target.value)}
                className="mt-1 w-full cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-marca-500 focus:outline-none focus:ring-4 focus:ring-marca-100"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => setEditEstrela(!editEstrela)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                editEstrela
                  ? 'border-amber-300 bg-amber-50 text-amber-700'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Star className={`size-4 ${editEstrela ? 'fill-current text-amber-500' : ''}`} />
              <span>{editEstrela ? 'Marcada com estrela' : 'Sem estrela'}</span>
            </button>
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => {
                if (tarefaEmEdicao) {
                  excluirTarefa(tarefaEmEdicao.id, tarefaEmEdicao.id_lista);
                  setTarefaEmEdicao(null);
                }
              }}
              className="flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700"
            >
              <Trash2 className="size-4" />
              <span>Excluir tarefa</span>
            </button>

            <div className="flex gap-2">
              <Botao aparencia="neutro" onClick={() => setTarefaEmEdicao(null)}>
                Cancelar
              </Botao>
              <Botao
                aparencia="primario"
                carregando={salvandoEdicao}
                disabled={!editTitulo.trim()}
                onClick={handleSalvarEdicao}
              >
                Salvar alterações
              </Botao>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
