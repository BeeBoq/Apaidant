-- =====================================================================
-- Page Maman – schéma de base de données (version 1)
--
-- Principe de sécurité :
--   * Aucune table n'est lisible ni modifiable directement avec la clé
--     publique (RLS activé, aucune politique, droits retirés).
--   * Tout passe par des fonctions qui vérifient un jeton secret :
--       - aidant_*   : jeton du lien aidant (lecture + écriture)
--       - appareil_* : jeton d'appairage (lecture seule)
--       - admin_*    : réservées à l'administrateur (éditeur SQL Supabase),
--                      jamais exposées à la clé publique.
--   * Les jetons ne sont stockés que sous forme d'empreinte SHA-256.
--
-- À exécuter une fois dans Supabase : SQL Editor → coller → Run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table if not exists public.acces_aidant (
  id          uuid primary key default gen_random_uuid(),
  libelle     text,
  jeton_hash  text not null unique,
  cree_le     timestamptz not null default now(),
  revoque_le  timestamptz
);

create table if not exists public.appareil (
  id                uuid primary key default gen_random_uuid(),
  nom               text not null,
  jeton_hash        text not null unique,
  derniere_synchro  timestamptz,
  version_app       text,
  cree_le           timestamptz not null default now(),
  revoque_le        timestamptz
);

-- Dates et heures sont stockées en heure locale (Europe/Paris) « murale » :
-- un rendez-vous hebdomadaire à 14 h 30 reste à 14 h 30 après un
-- changement d'heure.
create table if not exists public.rdv (
  id           uuid primary key default gen_random_uuid(),
  titre        text not null check (char_length(btrim(titre)) between 1 and 120),
  date_debut   date not null,
  heure_debut  time not null,
  heure_fin    time,
  lieu         text check (lieu is null or char_length(lieu) <= 200),
  detail       text check (detail is null or char_length(detail) <= 1000),
  repetition   text not null default 'aucune'
               check (repetition in ('aucune', 'hebdo', 'bihebdo', 'mensuel')),
  fin_serie    date,
  supprime     boolean not null default false,
  cree_par     text not null,
  modifie_par  text not null,
  cree_le      timestamptz not null default now(),
  modifie_le   timestamptz not null default now(),
  check (fin_serie is null or fin_serie >= date_debut),
  check (heure_fin is null or heure_fin > heure_debut)
);

-- Exception sur une occurrence d'une série : annulée ou modifiée.
create table if not exists public.rdv_exception (
  id               uuid primary key default gen_random_uuid(),
  rdv_id           uuid not null references public.rdv(id) on delete cascade,
  date_occurrence  date not null,
  annulee          boolean not null default false,
  date_nouvelle    date,
  titre            text check (titre is null or char_length(btrim(titre)) between 1 and 120),
  heure_debut      time,
  heure_fin        time,
  lieu             text check (lieu is null or char_length(lieu) <= 200),
  detail           text check (detail is null or char_length(detail) <= 1000),
  modifie_par      text not null,
  modifie_le       timestamptz not null default now(),
  unique (rdv_id, date_occurrence)
);

create table if not exists public.note (
  id           int primary key default 1 check (id = 1),
  titre        text not null default '' check (char_length(titre) <= 80),
  texte        text not null default '' check (char_length(texte) <= 600),
  modifie_par  text not null default 'système',
  modifie_le   timestamptz not null default now()
);
insert into public.note (id) values (1) on conflict (id) do nothing;

create table if not exists public.historique (
  id          bigint generated always as identity primary key,
  quand       timestamptz not null default now(),
  auteur      text not null,
  action      text not null,   -- creation | modification | suppression | annulation
  objet_type  text not null,   -- rdv | occurrence | note
  objet_id    text,
  resume      text not null,
  avant       jsonb,
  apres       jsonb,
  annule      boolean not null default false
);
create index if not exists historique_quand_idx on public.historique (quand desc);

-- Verrouillage : aucune lecture/écriture directe avec la clé publique.
alter table public.acces_aidant  enable row level security;
alter table public.appareil      enable row level security;
alter table public.rdv           enable row level security;
alter table public.rdv_exception enable row level security;
alter table public.note          enable row level security;
alter table public.historique    enable row level security;

revoke all on public.acces_aidant, public.appareil, public.rdv,
              public.rdv_exception, public.note, public.historique
  from anon, authenticated;

-- ---------------------------------------------------------------------
-- Fonctions internes
-- ---------------------------------------------------------------------

create or replace function public._hash(p_jeton text)
returns text language sql immutable as $$
  select encode(sha256(convert_to(coalesce(p_jeton, ''), 'UTF8')), 'hex')
$$;

create or replace function public._nouveau_jeton()
returns text language sql volatile as $$
  -- 2 UUID v4 aléatoires = 244 bits d'entropie, 64 caractères hexadécimaux
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
$$;

create or replace function public._aujourdhui()
returns date language sql stable as $$
  select (now() at time zone 'Europe/Paris')::date
$$;

create or replace function public._verifier_aidant(p_jeton text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if p_jeton is null or char_length(p_jeton) < 32 or not exists (
    select 1 from acces_aidant where jeton_hash = _hash(p_jeton) and revoque_le is null
  ) then
    raise exception 'acces_refuse' using errcode = '28000';
  end if;
end $$;

create or replace function public._auteur(p_nom text)
returns text language plpgsql immutable as $$
declare v text := btrim(coalesce(p_nom, ''));
begin
  if v = '' then raise exception 'nom_requis' using errcode = '22023'; end if;
  return left(v, 60);
end $$;

create or replace function public._vide_null(p text)
returns text language sql immutable as $$ select nullif(btrim(p), '') $$;

create or replace function public._date_fr(d date)
returns text language sql immutable as $$ select to_char(d, 'DD/MM/YYYY') $$;

-- ---------------------------------------------------------------------
-- Espace aidant
-- ---------------------------------------------------------------------

create or replace function public.aidant_etat(p_jeton text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform _verifier_aidant(p_jeton);
  return jsonb_build_object(
    'note', (select to_jsonb(n) from note n where id = 1),
    'rdvs', coalesce((select jsonb_agg(to_jsonb(r) order by r.date_debut, r.heure_debut)
                      from rdv r where not r.supprime), '[]'::jsonb),
    'exceptions', coalesce((select jsonb_agg(to_jsonb(e))
                            from rdv_exception e join rdv r on r.id = e.rdv_id
                            where not r.supprime), '[]'::jsonb),
    'appareils', coalesce((select jsonb_agg(jsonb_build_object(
                              'id', a.id, 'nom', a.nom,
                              'derniere_synchro', a.derniere_synchro,
                              'version_app', a.version_app) order by a.nom)
                           from appareil a where a.revoque_le is null), '[]'::jsonb),
    'historique', coalesce((select jsonb_agg(to_jsonb(h) order by h.quand desc)
                            from (select * from historique order by quand desc limit 200) h),
                           '[]'::jsonb),
    'aujourdhui', _aujourdhui(),
    'serveur_le', now()
  );
end $$;

create or replace function public.aidant_enregistrer_rdv(p_jeton text, p_auteur text, p_rdv jsonb)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_auteur text := _auteur(p_auteur);
  v_id uuid := nullif(p_rdv->>'id', '')::uuid;
  v_avant rdv;
  v_apres rdv;
  v_rep text := coalesce(nullif(p_rdv->>'repetition', ''), 'aucune');
begin
  perform _verifier_aidant(p_jeton);

  if v_id is null then
    insert into rdv (titre, date_debut, heure_debut, heure_fin, lieu, detail,
                     repetition, fin_serie, cree_par, modifie_par)
    values (btrim(p_rdv->>'titre'),
            (p_rdv->>'date_debut')::date,
            (p_rdv->>'heure_debut')::time,
            nullif(p_rdv->>'heure_fin', '')::time,
            _vide_null(p_rdv->>'lieu'),
            _vide_null(p_rdv->>'detail'),
            v_rep,
            case when v_rep = 'aucune' then null else nullif(p_rdv->>'fin_serie', '')::date end,
            v_auteur, v_auteur)
    returning * into v_apres;

    insert into historique (auteur, action, objet_type, objet_id, resume, avant, apres)
    values (v_auteur, 'creation', 'rdv', v_apres.id,
            format('Ajout de « %s » le %s à %s', v_apres.titre, _date_fr(v_apres.date_debut),
                   to_char(v_apres.heure_debut, 'HH24"h"MI')),
            null, to_jsonb(v_apres));
  else
    select * into v_avant from rdv where id = v_id and not supprime for update;
    if not found then raise exception 'rdv_introuvable' using errcode = 'P0002'; end if;

    update rdv set
      titre       = btrim(p_rdv->>'titre'),
      date_debut  = (p_rdv->>'date_debut')::date,
      heure_debut = (p_rdv->>'heure_debut')::time,
      heure_fin   = nullif(p_rdv->>'heure_fin', '')::time,
      lieu        = _vide_null(p_rdv->>'lieu'),
      detail      = _vide_null(p_rdv->>'detail'),
      repetition  = v_rep,
      fin_serie   = case when v_rep = 'aucune' then null else nullif(p_rdv->>'fin_serie', '')::date end,
      modifie_par = v_auteur,
      modifie_le  = now()
    where id = v_id
    returning * into v_apres;

    insert into historique (auteur, action, objet_type, objet_id, resume, avant, apres)
    values (v_auteur, 'modification', 'rdv', v_id,
            format('Modification de « %s »', v_apres.titre),
            to_jsonb(v_avant), to_jsonb(v_apres));
  end if;

  return v_apres.id;
end $$;

create or replace function public.aidant_supprimer_rdv(p_jeton text, p_auteur text, p_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_auteur text := _auteur(p_auteur);
  v_avant rdv;
  v_apres rdv;
begin
  perform _verifier_aidant(p_jeton);
  select * into v_avant from rdv where id = p_id and not supprime for update;
  if not found then raise exception 'rdv_introuvable' using errcode = 'P0002'; end if;

  update rdv set supprime = true, modifie_par = v_auteur, modifie_le = now()
  where id = p_id returning * into v_apres;

  insert into historique (auteur, action, objet_type, objet_id, resume, avant, apres)
  values (v_auteur, 'suppression', 'rdv', p_id,
          case when v_avant.repetition = 'aucune'
               then format('Suppression de « %s » du %s', v_avant.titre, _date_fr(v_avant.date_debut))
               else format('Suppression de toute la série « %s »', v_avant.titre) end,
          to_jsonb(v_avant), to_jsonb(v_apres));
end $$;

-- Modifier (p_modif non nul) ou annuler (p_modif nul) une seule occurrence.
create or replace function public.aidant_exception_occurrence(
  p_jeton text, p_auteur text, p_rdv_id uuid, p_date date, p_modif jsonb)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_auteur text := _auteur(p_auteur);
  v_serie rdv;
  v_avant rdv_exception;
  v_apres rdv_exception;
  v_trouve boolean;
begin
  perform _verifier_aidant(p_jeton);
  select * into v_serie from rdv where id = p_rdv_id and not supprime;
  if not found then raise exception 'rdv_introuvable' using errcode = 'P0002'; end if;
  if v_serie.repetition = 'aucune' then raise exception 'pas_une_serie' using errcode = '22023'; end if;

  select * into v_avant from rdv_exception where rdv_id = p_rdv_id and date_occurrence = p_date for update;
  v_trouve := found;

  insert into rdv_exception (rdv_id, date_occurrence, annulee, date_nouvelle, titre,
                             heure_debut, heure_fin, lieu, detail, modifie_par, modifie_le)
  values (p_rdv_id, p_date, p_modif is null,
          nullif(p_modif->>'date', '')::date,
          _vide_null(p_modif->>'titre'),
          nullif(p_modif->>'heure_debut', '')::time,
          nullif(p_modif->>'heure_fin', '')::time,
          _vide_null(p_modif->>'lieu'),
          _vide_null(p_modif->>'detail'),
          v_auteur, now())
  on conflict (rdv_id, date_occurrence) do update set
    annulee = excluded.annulee, date_nouvelle = excluded.date_nouvelle,
    titre = excluded.titre, heure_debut = excluded.heure_debut, heure_fin = excluded.heure_fin,
    lieu = excluded.lieu, detail = excluded.detail,
    modifie_par = excluded.modifie_par, modifie_le = excluded.modifie_le
  returning * into v_apres;

  insert into historique (auteur, action, objet_type, objet_id, resume, avant, apres)
  values (v_auteur,
          case when p_modif is null then 'suppression' else 'modification' end,
          'occurrence', v_apres.id,
          case when p_modif is null
               then format('Suppression de « %s » du %s (une seule fois)', v_serie.titre, _date_fr(p_date))
               else format('Modification de « %s » du %s (une seule fois)', v_serie.titre, _date_fr(p_date)) end,
          case when v_trouve then to_jsonb(v_avant) else null end,
          to_jsonb(v_apres));
end $$;

create or replace function public.aidant_enregistrer_note(
  p_jeton text, p_auteur text, p_titre text, p_texte text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_auteur text := _auteur(p_auteur);
  v_avant note;
  v_apres note;
begin
  perform _verifier_aidant(p_jeton);
  select * into v_avant from note where id = 1 for update;
  update note set titre = btrim(coalesce(p_titre, '')), texte = btrim(coalesce(p_texte, '')),
                  modifie_par = v_auteur, modifie_le = now()
  where id = 1 returning * into v_apres;

  insert into historique (auteur, action, objet_type, objet_id, resume, avant, apres)
  values (v_auteur, 'modification', 'note', '1',
          format('Note modifiée : « %s »', left(coalesce(nullif(v_apres.titre, ''), v_apres.texte), 60)),
          to_jsonb(v_avant), to_jsonb(v_apres));
end $$;

-- Annule une action de l'historique en restaurant l'état « avant ».
create or replace function public.aidant_annuler_action(p_jeton text, p_auteur text, p_historique_id bigint)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_auteur text := _auteur(p_auteur);
  h historique;
  r rdv;
  e rdv_exception;
  n note;
begin
  perform _verifier_aidant(p_jeton);
  select * into h from historique where id = p_historique_id for update;
  if not found then raise exception 'action_introuvable' using errcode = 'P0002'; end if;
  if h.annule or h.action = 'annulation' then
    raise exception 'deja_annulee' using errcode = '22023';
  end if;

  if h.objet_type = 'rdv' then
    if h.avant is null then
      update rdv set supprime = true, modifie_par = v_auteur, modifie_le = now()
      where id = h.objet_id::uuid;
    else
      r := jsonb_populate_record(null::rdv, h.avant);
      update rdv set titre = r.titre, date_debut = r.date_debut, heure_debut = r.heure_debut,
                     heure_fin = r.heure_fin, lieu = r.lieu, detail = r.detail,
                     repetition = r.repetition, fin_serie = r.fin_serie, supprime = r.supprime,
                     modifie_par = v_auteur, modifie_le = now()
      where id = r.id;
    end if;
  elsif h.objet_type = 'occurrence' then
    if h.avant is null then
      delete from rdv_exception where id = h.objet_id::uuid;
    else
      e := jsonb_populate_record(null::rdv_exception, h.avant);
      update rdv_exception set annulee = e.annulee, date_nouvelle = e.date_nouvelle, titre = e.titre,
                               heure_debut = e.heure_debut, heure_fin = e.heure_fin, lieu = e.lieu,
                               detail = e.detail, modifie_par = v_auteur, modifie_le = now()
      where id = e.id;
    end if;
  elsif h.objet_type = 'note' then
    n := jsonb_populate_record(null::note, h.avant);
    update note set titre = n.titre, texte = n.texte, modifie_par = v_auteur, modifie_le = now()
    where id = 1;
  end if;

  update historique set annule = true where id = h.id;
  insert into historique (auteur, action, objet_type, objet_id, resume, avant, apres)
  values (v_auteur, 'annulation', h.objet_type, h.objet_id,
          'Annulation : ' || h.resume, null, jsonb_build_object('historique_id', h.id));
end $$;

create or replace function public.aidant_exporter(p_jeton text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform _verifier_aidant(p_jeton);
  return jsonb_build_object(
    'exporte_le', now(),
    'note', (select to_jsonb(n) from note n where id = 1),
    'rdvs', coalesce((select jsonb_agg(to_jsonb(r)) from rdv r), '[]'::jsonb),
    'exceptions', coalesce((select jsonb_agg(to_jsonb(e)) from rdv_exception e), '[]'::jsonb),
    'historique', coalesce((select jsonb_agg(to_jsonb(h) order by h.id) from historique h), '[]'::jsonb)
  );
end $$;

-- Efface toutes les données (rendez-vous, note, historique). Irréversible.
create or replace function public.aidant_tout_effacer(p_jeton text, p_auteur text, p_confirmation text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_auteur text := _auteur(p_auteur);
begin
  perform _verifier_aidant(p_jeton);
  if p_confirmation is distinct from 'EFFACER' then
    raise exception 'confirmation_requise' using errcode = '22023';
  end if;
  delete from rdv_exception where true;
  delete from rdv where true;
  delete from historique where true;
  update note set titre = '', texte = '', modifie_par = v_auteur, modifie_le = now() where id = 1;
  insert into historique (auteur, action, objet_type, objet_id, resume)
  values (v_auteur, 'suppression', 'note', null, 'Toutes les données ont été effacées');
end $$;

-- ---------------------------------------------------------------------
-- Appareils de la personne aidée (lecture seule)
-- ---------------------------------------------------------------------

create or replace function public.appareil_synchroniser(p_jeton text, p_version text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_appareil appareil;
  v_jour date := _aujourdhui();
begin
  update appareil set derniere_synchro = now(), version_app = left(p_version, 40)
  where jeton_hash = _hash(p_jeton) and revoque_le is null
  returning * into v_appareil;
  if not found then raise exception 'acces_refuse' using errcode = '28000'; end if;

  return jsonb_build_object(
    'appareil', v_appareil.nom,
    'note', (select jsonb_build_object('titre', titre, 'texte', texte) from note where id = 1),
    'rdvs', coalesce((select jsonb_agg(jsonb_build_object(
                'id', r.id, 'titre', r.titre, 'date_debut', r.date_debut,
                'heure_debut', r.heure_debut, 'heure_fin', r.heure_fin, 'lieu', r.lieu,
                'repetition', r.repetition, 'fin_serie', r.fin_serie))
              from rdv r
              where not r.supprime
                and (r.fin_serie is null or r.fin_serie >= v_jour - 1)
                and (r.repetition <> 'aucune' or r.date_debut >= v_jour - 1)), '[]'::jsonb),
    'exceptions', coalesce((select jsonb_agg(jsonb_build_object(
                'rdv_id', e.rdv_id, 'date_occurrence', e.date_occurrence, 'annulee', e.annulee,
                'date_nouvelle', e.date_nouvelle, 'titre', e.titre, 'heure_debut', e.heure_debut,
                'heure_fin', e.heure_fin, 'lieu', e.lieu))
              from rdv_exception e join rdv r on r.id = e.rdv_id
              where not r.supprime
                and greatest(e.date_occurrence, coalesce(e.date_nouvelle, e.date_occurrence)) >= v_jour - 1),
              '[]'::jsonb),
    'serveur_le', now()
  );
end $$;

-- ---------------------------------------------------------------------
-- Administration (éditeur SQL Supabase uniquement)
-- ---------------------------------------------------------------------

create or replace function public.admin_creer_acces_aidant(p_libelle text default null)
returns text language plpgsql volatile security definer set search_path = public as $$
declare v_jeton text := _nouveau_jeton();
begin
  insert into acces_aidant (libelle, jeton_hash) values (p_libelle, _hash(v_jeton));
  return v_jeton;  -- à noter : il n'est stocké nulle part en clair
end $$;

-- Révoque tous les liens aidants actifs et en crée un nouveau.
create or replace function public.admin_renouveler_acces_aidant(p_libelle text default null)
returns text language plpgsql volatile security definer set search_path = public as $$
begin
  update acces_aidant set revoque_le = now() where revoque_le is null;
  return admin_creer_acces_aidant(p_libelle);
end $$;

create or replace function public.admin_creer_appareil(p_nom text)
returns text language plpgsql volatile security definer set search_path = public as $$
declare v_jeton text := _nouveau_jeton();
begin
  insert into appareil (nom, jeton_hash) values (btrim(p_nom), _hash(v_jeton));
  return v_jeton;
end $$;

create or replace function public.admin_revoquer_appareil(p_nom text)
returns int language plpgsql volatile security definer set search_path = public as $$
declare v_n int;
begin
  update appareil set revoque_le = now() where nom = p_nom and revoque_le is null;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ---------------------------------------------------------------------
-- Droits d'exécution
-- ---------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.aidant_etat(text),
  public.aidant_enregistrer_rdv(text, text, jsonb),
  public.aidant_supprimer_rdv(text, text, uuid),
  public.aidant_exception_occurrence(text, text, uuid, date, jsonb),
  public.aidant_enregistrer_note(text, text, text, text),
  public.aidant_annuler_action(text, text, bigint),
  public.aidant_exporter(text),
  public.aidant_tout_effacer(text, text, text),
  public.appareil_synchroniser(text, text)
to anon, authenticated;

-- Les nouvelles fonctions ne doivent pas être exécutables par défaut.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
