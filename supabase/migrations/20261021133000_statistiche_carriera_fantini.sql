-- Statistiche di carriera aggiornate sui profili dell'Archivio del Palio di Siena,
-- con dati disponibili fino al Palio del 16 agosto 2026.
-- I Palii non disputati non sono conteggiati tra quelli corsi.
DO $$
DECLARE
  r record;
  righe_aggiornate integer;
BEGIN
  FOR r IN
    SELECT *
    FROM (VALUES
      ('Amsicora', 8, 0),
      ('Bellocchio', 11, 0),
      ('Bighino', 28, 0),
      ('Brigante', 20, 3),
      ('Carburo', 9, 0),
      ('Fastidio', 1, 0),
      ('Gingillo', 36, 4),
      ('Girolamo', 12, 0),
      ('Grandine', 16, 0),
      ('Granito', 1, 0),
      ('Lesto', 1, 0),
      ('Scompiglio', 34, 5),
      ('Shardana', 2, 0),
      ('Spago', 2, 0),
      ('Tambani', 2, 0),
      ('Tamurè', 7, 0),
      ('Tempesta', 9, 1),
      ('Tittia', 43, 13),
      ('Tremendo', 12, 0),
      ('Turbine', 12, 0),
      ('Velluto', 13, 1),
      ('Virgola', 5, 0)
    ) AS dati(soprannome, palii_corsi, vittorie)
  LOOP
    UPDATE public.fantini AS f
    SET palii_corsi = r.palii_corsi,
        vittorie = r.vittorie
    WHERE lower(trim(f.soprannome)) = lower(trim(r.soprannome));

    GET DIAGNOSTICS righe_aggiornate = ROW_COUNT;
    IF righe_aggiornate <> 1 THEN
      RAISE EXCEPTION 'Atteso un record per il fantino %, aggiornati %', r.soprannome, righe_aggiornate;
    END IF;
  END LOOP;
END
$$;
