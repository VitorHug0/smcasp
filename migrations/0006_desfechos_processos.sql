-- Separa a posição técnica "Concluído" do motivo pelo qual o processo saiu
-- do quadro. Processos históricos com compra vinculada são classificados como
-- compra; os demais ficam explicitamente como conclusão sem compra.
ALTER TABLE processos ADD COLUMN desfecho TEXT
  CHECK (desfecho IS NULL OR desfecho IN
    ('Concluído com compra', 'Concluído sem compra', 'Cancelado',
     'Arquivado', 'Substituído por outro processo'));

ALTER TABLE processos ADD COLUMN substituido_por TEXT;

UPDATE processos
SET desfecho = CASE
  WHEN EXISTS (SELECT 1 FROM compras c WHERE c.id_processo = processos.id)
    THEN 'Concluído com compra'
  ELSE 'Concluído sem compra'
END
WHERE etapa = 'Concluído' AND desfecho IS NULL;
