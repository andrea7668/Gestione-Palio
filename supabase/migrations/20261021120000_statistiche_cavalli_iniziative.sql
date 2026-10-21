ALTER TABLE public.cavalli
  ADD COLUMN IF NOT EXISTS eta integer,
  ADD COLUMN IF NOT EXISTS palii_corsi integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vittorie integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mossa integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mossa_rincorsa integer,
  ADD COLUMN IF NOT EXISTS giro_1 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS giro_2 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS giro_3 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sanmartino_curva_1 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sanmartino_curva_2 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sanmartino_curva_3 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS casato_curva_1 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS casato_curva_2 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS casato_curva_3 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nota text;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT *
    FROM (VALUES
      ('Abbasantesa', 7, 75, 3, 3,  2, NULL,  0,  0,  0, -1,  0,  0, -1,  0,  0, NULL),
      ('Akida', NULL, 63, 0, 0, -1, NULL, -1,  0,  0, -1, -1,  0, -1,  0,  0, '1° giro -1 comprese le curve.'),
      ('Anda e bola', NULL, 96, 0, 0,  1, NULL,  1,  1,  0,  1,  0,  0,  1,  0,  1, '1° giro +1 comprese le curve; 2° giro +1 eccetto le curve.'),
      ('Antine day', NULL, 72, 0, 0,  0, NULL,  0,  0,  0, -1, -2,  0,  0,  0,  0, NULL),
      ('Arestetulesu', NULL, 74, 0, 0,  0, NULL,  0,  0,  0,  0,  0,  0, -1,  0,  0, NULL),
      ('Ardeglina', NULL, 52, 0, 0, -2, NULL, -1, -1,  0, -1, -1, -1, -1, -1,  0, '1° e 2° giro -1 comprese le curve.'),
      ('Ares elce', NULL, 86, 0, 0,  1, NULL,  1,  0,  0,  1,  0,  0,  1,  0,  0, '1° giro +1 comprese le curve.'),
      ('Astoriux', NULL, 62, 0, 0, -1, NULL, -1,  0,  0, -1, -1,  0, -1, -1,  0, '1° giro -1 comprese le curve.'),
      ('Baila', NULL, 72, 0, 0, -2, NULL,  0,  0,  0, -1,  0, -1,  0,  0,  1, NULL),
      ('Benitos', NULL, 87, 0, 0,  1, NULL,  1,  0,  0,  1,  1,  0,  1,  0,  0, '1° giro +1 comprese le curve.'),
      ('Bolina da clodia', NULL, 73, 0, 0,  0, NULL,  0,  0,  0,  0,  0, -1, -1,  0,  0, NULL),
      ('Bonitas', NULL, 72, 0, 0, -2, NULL,  0,  0,  0,  0,  1,  0,  0, -1, -1, NULL),
      ('Brivido sardo', NULL, 73, 0, 0,  0, NULL,  0,  0,  0, -1, -1,  0,  0,  0,  0, NULL),
      ('Canarinu', NULL, 78, 0, 0,  1, NULL,  0,  0,  0,  0,  1,  1,  0,  0,  0, NULL),
      ('Cassiox', NULL, 75, 0, 0,  0, NULL,  0,  0,  0, -1,  0,  0,  1,  0, -1, NULL),
      ('Chiosa vince', NULL, 71, 0, 0,  0, NULL,  0,  0,  0,  0, -1, -1, -1, -1,  0, NULL),
      ('Cobalto da clodia', NULL, 72, 0, 0,  0, NULL,  0,  0,  0, -1,  0, -1,  0,  0, -1, NULL),
      ('Comancio', NULL, 79, 0, 0,  1, NULL,  0,  0,  0,  0,  1,  0,  1,  0,  1, NULL),
      ('Compilation', NULL, 73, 0, 0, -2, NULL,  0,  0,  0,  0,  0,  0,  0,  0,  0, NULL),
      ('Criptha', NULL, 63, 0, 0, -2, NULL, -1,  0,  0, -1,  0,  0, -1,  0,  0, '1° giro -1 comprese le curve.'),
      ('Daredevil', NULL, 74, 0, 0, -1, NULL,  0,  0,  0,  0,  0,  0,  1, -1,  0, NULL),
      ('Dedalo king', NULL, 71, 0, 0,  0, NULL,  0,  0,  0,  0, -1, -1,  0, -1, -1, NULL),
      ('Demoni', NULL, 72, 0, 0, -1, NULL,  0,  0,  0, -1, -1,  1,  0, -1,  0, NULL),
      ('Diamante grigio', NULL, 71, 0, 0, -1, NULL,  0,  0,  0, -1, -1,  0, -1,  0,  0, NULL),
      ('Diamante sauro', NULL, 71, 0, 0, -2, NULL,  0,  0,  0,  0, -1,  0,  0,  0, -1, NULL),
      ('Diosu de campeda', NULL, 81, 0, 0, -2, NULL,  0,  1,  0,  0,  0,  0, -1,  0,  0, '2° giro +1 eccetto le curve.'),
      ('Diodoro', NULL, 96, 0, 0,  2, NULL,  1,  0,  1,  1,  0,  0,  1,  0,  0, '1° giro +1 comprese le curve; 3° giro +1 eccetto le curve.'),
      ('Doctor donald', NULL, 73, 0, 0, -2, NULL,  0,  0,  0,  0,  0,  0,  0,  0,  0, NULL),
      ('Dolcecomelanutella', NULL, 73, 0, 0, -1, NULL,  0,  0,  0,  0, -1,  1,  0, -1,  0, NULL),
      ('Dollaro', NULL, 72, 0, 0,  0, NULL,  0,  0,  0, -1, -1, -1,  0, -1,  1, NULL),
      ('Dorotea dimmonia', NULL, 72, 0, 0, -1, NULL,  0,  0,  0, -1,  0, -1,  0,  0,  0, NULL),
      ('Eberardo', NULL, 74, 0, 0, -1, NULL,  0,  0,  0,  0,  1,  0,  0, -1,  0, NULL),
      ('Eccolo', NULL, 71, 0, 0,  0, NULL,  0,  0,  0, -1,  0, -1,  0, -1, -1, NULL),
      ('Ellenico', NULL, 70, 0, 0, -1, NULL,  0,  0,  0, -1, -1,  0,  0, -1, -1, NULL),
      ('Ennalzu', NULL, 72, 0, 0, -2, NULL,  0,  0,  0,  1,  0, -1, -1,  0,  0, NULL),
      ('Entu de pedra ulpu', NULL, 64, 0, 0,  0, NULL,  0, -1,  0, -1, -1,  0,  0, -1,  0, '2° giro -1 comprese le curve.'),
      ('Eros orotellese', NULL, 74, 0, 0, -1, NULL,  0,  0,  0,  0,  0,  0,  0,  0,  0, NULL),
      ('Erminio baio', NULL, 70, 0, 0, -1, NULL,  0,  0,  0, -1,  0, -1,  0, -1, -1, NULL),
      ('Eschilo de aighenta', NULL, 70, 0, 0, -1, NULL,  0,  0,  0, -1,  0, -1,  1, -1, -1, NULL),
      ('Esmeralda baia', NULL, 71, 0, 0, -1, NULL,  0,  0,  0,  0,  0, -1, -1, -1,  0, NULL),
      ('Estrella olianesa', NULL, 70, 0, 0, -1, NULL,  0,  0,  0, -1,  0, -1, -1,  0, -1, NULL),
      ('Etrinta', NULL, 73, 0, 0,  0, NULL,  0,  0,  0, -1,  0,  1, -1, -1,  0, NULL),
      ('Fenomenale', NULL, 72, 0, 0, -2, NULL,  0,  0,  0,  0,  0,  0,  0,  0, -1, NULL),
      ('Gioia pura', NULL, 73, 0, 0, -1, NULL,  0,  0,  0,  0,  0,  0, -1,  0,  0, NULL),
      ('Milady bondreamer', NULL, 72, 0, 0,  0, NULL,  0,  0,  0, -1, -1, -1,  0,  0,  0, NULL),
      ('Reo confesso', NULL, 64, 0, 0,  0, NULL,  0,  0, -1, -1,  0, -1,  0,  0, -1, '3° giro -1 comprese le curve.'),
      ('Schietta', 8, 76, 2, 2,  1, NULL,  0,  0,  0,  1,  0,  0,  0,  0, -1, NULL),
      ('Solu tue due', NULL, 76, 0, 0,  1, NULL,  0,  0,  0,  0,  0,  0,  0,  0,  0, NULL),
      ('Tabacco', NULL, 77, 0, 0,  0, NULL,  0,  0,  0,  0,  1,  1,  0,  1, -1, NULL),
      ('Tale e quale', 10, 86, 4, 4,  1, NULL,  0,  1,  0,  0,  0,  0,  0,  0,  1, '2° giro +1 eccetto le curve.'),
      ('Una per tutti', NULL, 74, 0, 0,  1, NULL,  0,  0,  0, -1,  0,  0,  0, -1,  0, NULL),
      ('Ungaros', 9, 77, 3, 3,  1, NULL,  0,  0,  0,  1,  0,  0,  0,  0,  0, NULL),
      ('Veranu', NULL, 76, 0, 0,  1, NULL,  0,  0,  0, -1,  0,  0,  0,  1,  0, NULL),
      ('Violenta da clodia', 7, 96, 2, 2,  1, NULL,  1,  1,  0,  1,  1,  1,  1,  1,  0, '1° e 2° giro +1 comprese le curve.'),
      ('Viso d''angelo', NULL, 80, 0, 0,  1, NULL,  0,  0,  0,  1,  1,  1,  0,  0,  1, NULL),
      ('Vitzichesu', 6, 70, 1, 1, -2, NULL,  0,  0,  0, -1, -2,  0,  0,  0,  0, NULL),
      ('Volcan de bonorva', NULL, 73, 0, 0, -1, NULL,  0,  0,  0,  0,  0,  1,  0, -1, -1, NULL),
      ('Volpino', NULL, 64, 0, 0, -1, -2, -1,  0,  0, -1,  0,  0, -1,  0,  0, '1° giro -1 comprese le curve.'),
      ('Zenis', NULL, 86, 0, 0,  2, NULL,  1,  0,  0,  0,  0, -1,  0,  0,  0, '1° giro +1 eccetto le curve.'),
      ('Zentile', NULL, 63, 0, 0, -2, NULL, -1,  0,  0,  0,  0,  0,  0,  0,  0, '1° giro -1 eccetto le curve.'),
      ('Zentiles', NULL, 74, 0, 0, -1, NULL,  0,  0,  0,  0,  0,  0,  0,  0,  0, NULL),
      ('Zinias', NULL, 72, 0, 0,  0, NULL,  0,  0,  0, -1,  0, -1, -1,  0,  0, NULL),
      ('Zenios', NULL, 55, 0, 0, -1, -2, -1, -1,  0, -1, -1,  0, -1, -1,  0, '1° e 2° giro -1 comprese le curve.'),
      ('Zio frac', 9, 85, 5, 5,  0, NULL,  1,  0,  0,  0,  1,  0,  0,  0,  0, '1° giro +1 eccetto le curve.')
    ) AS dati(nome, eta, overall, palii_corsi, vittorie, mossa, mossa_rincorsa, giro_1, giro_2, giro_3, sanmartino_curva_1, sanmartino_curva_2, sanmartino_curva_3, casato_curva_1, casato_curva_2, casato_curva_3, nota)
  LOOP
    UPDATE public.cavalli AS c
    SET overall = r.overall,
        eta = r.eta,
        palii_corsi = r.palii_corsi,
        vittorie = r.vittorie,
        mossa = r.mossa,
        mossa_rincorsa = r.mossa_rincorsa,
        giro_1 = r.giro_1,
        giro_2 = r.giro_2,
        giro_3 = r.giro_3,
        sanmartino_curva_1 = r.sanmartino_curva_1,
        sanmartino_curva_2 = r.sanmartino_curva_2,
        sanmartino_curva_3 = r.sanmartino_curva_3,
        casato_curva_1 = r.casato_curva_1,
        casato_curva_2 = r.casato_curva_2,
        casato_curva_3 = r.casato_curva_3,
        nota = r.nota
    WHERE lower(trim(c.nome)) = lower(trim(r.nome));

    IF NOT FOUND THEN
      INSERT INTO public.cavalli (
        nome, overall, eta, palii_corsi, vittorie, mossa, mossa_rincorsa,
        giro_1, giro_2, giro_3,
        sanmartino_curva_1, sanmartino_curva_2, sanmartino_curva_3,
        casato_curva_1, casato_curva_2, casato_curva_3, nota
      ) VALUES (
        r.nome, r.overall, r.eta, r.palii_corsi, r.vittorie, r.mossa, r.mossa_rincorsa,
        r.giro_1, r.giro_2, r.giro_3,
        r.sanmartino_curva_1, r.sanmartino_curva_2, r.sanmartino_curva_3,
        r.casato_curva_1, r.casato_curva_2, r.casato_curva_3, r.nota
      );
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT *
    FROM (VALUES
      ('Telefonata informale', 0::numeric, 0::numeric),
      ('Aperitivo', 0.5::numeric, 2::numeric),
      ('Cena', 0::numeric, 3::numeric),
      ('Invito in Contrada', 0::numeric, 3::numeric),
      ('Visita in scuderia', 0.5::numeric, 2.5::numeric),
      ('Contributo alla scuderia', 1::numeric, 4::numeric),
      ('Piccolo regalo', 0::numeric, 1.5::numeric),
      ('Regalo importante', 2::numeric, 6::numeric)
    ) AS dati(nome, costo_minimo, costo_massimo)
  LOOP
    UPDATE public.tipi_attivita AS t
    SET costo_minimo = r.costo_minimo,
        costo_massimo = r.costo_massimo
    WHERE lower(trim(t.nome)) = lower(trim(r.nome));

    IF NOT FOUND THEN
      INSERT INTO public.tipi_attivita (nome, costo_minimo, costo_massimo, variazione_massima)
      VALUES (r.nome, r.costo_minimo, r.costo_massimo, 1);
    END IF;
  END LOOP;
END
$$;
