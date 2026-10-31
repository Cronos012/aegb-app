# Guide de reprise

Ce fichier explique comment le travail se fait sur ce dépôt, pour qu'un nouvel agent (ou un nouveau développeur) reprenne exactement là où on en est, sans rien demander ni rien reconfigurer. Lis-le en entier avant de toucher au code. Le `README.md` décrit l'appli ; ce guide décrit la façon de travailler.

## Le projet en bref

- L'appli de l'AEGB (Association des Étudiants Guinéens de Brest) : réseau privé des membres (fil, messages, cotisation, votes, événements, documents) et mode bureau pour gérer l'association.
- Le porteur du projet est **Cronos**. Il écrit en français, souvent depuis son téléphone. Toutes les décisions lui reviennent.
- Pile : React 19, Vite, Tailwind v4 (`@theme`, `@utility` dans `src/index.css`), TanStack Query, Supabase (Postgres, RLS, fonctions `security definer`, schéma `private`, stockage, fonctions serveur).
- Une seule association : l'AEGB. L'ancienne appli (dépôt `connect-org-hub`) ne sert que de référence ; aucune donnée n'en est reprise.

## Règles de Cronos (à respecter sans exception)

1. **Tout est signé Cronos.** Auteur et committer des commits : `Cronos <163435331+Cronos012@users.noreply.github.com>`. Dans les commits, les PR, le code et la version en ligne : pas de ligne `Co-Authored-By`, pas de lien de session, pas de pied de page ajouté par un outil (« Generated with… »), pas de bloc « Requested by… » en tête de PR. Si un outil ajoute un pied de page à une PR, retire-le aussitôt en remettant la description sans lui.
2. **Méthode par lots.** Pour chaque nouvelle partie : plan du lot, réflexion sur l'interface, maquette soignée (écrans téléphone 390×844, et PC quand il faut), validation explicite de Cronos, et **seulement ensuite** le code. Ne jamais coder avant son « ok ».
3. **Messages courts.** Pas de message « je commence » ni « j'ai fini l'étape ». Un message seulement pour un résultat, une question ou une action qu'il doit faire. Tenir une liste de suivi à jour pour qu'il voie où on en est.
4. **Jamais de SQL à coller.** La base se met à jour par GitHub (voir plus bas). Ne lui donner du SQL qu'en tout dernier recours, en expliquant pourquoi.
5. **Aucune clé secrète dans le dépôt** (il est public). Les secrets vont dans GitHub (Settings → Secrets and variables → Actions) ou dans Supabase. Ne jamais demander qu'une clé soit collée dans une conversation.
6. **Les 30 comptes d'essai** (`prenom.nom@aegb-test.invalid`) restent en base jusqu'au lancement : ne pas les effacer.
7. **Les droits de l'admin numérique sont discrets** : pour les autres membres, ce poste ressemble à un poste ordinaire. Ce qu'il fait est signé « Le bureau ». Ne jamais afficher de cadenas, de « ne peut pas être retiré » ou de mention de ses droits ailleurs que pour lui et son successeur.
8. **Ce qui ne s'annule pas attend son accord écrit** : fusion dans `main`, suppression de données, envoi forcé (`push --force`), changement sur le vrai domaine, envoi d'un message hors du projet.

## Branches et PR

- Les lots 1 à 8 sont tous fusionnés dans `main` (31/10/2026). Il ne reste que deux branches : `main` (le code) et `gh-pages` (la version d'essai publiée).
- Pour une nouvelle partie : une branche `lot-N-nom` partie de `main`, et une PR vers `main`. On fusionne quand Cronos le demande.
- Le préfixe `lot-` compte : c'est lui qui déclenche la mise à jour de la base (voir plus bas).
- Messages de commit en français, qui disent ce que l'utilisateur gagne (« Compte AEGB dans le fil : publier, commenter et réagir au nom de l'AEGB »).
- Description de PR : ce qui change, comment l'essayer, ce qui reste. Pas de pied de page.

## Avant chaque envoi

```sh
npm run typecheck   # types
npm run lint        # relecture automatique (les avertissements déjà présents sont connus)
npm test            # tests de src/lib
```

Puis un essai à l'écran : l'appli en local avec des réponses de Supabase simulées (Playwright intercepte `*.supabase.co`, pose une fausse session dans `localStorage` sous `sb-lahllstfpmjfcavptlmt-auth-token`, et renvoie des lignes inventées). Capturer le téléphone (390×844) et le PC (1440×900), en clair et en sombre, et regarder chaque capture.

## La base Supabase

- Les migrations sont dans `supabase/migrations`, une par changement, numérotées par date (`AAAAMMJJHHMMSS_nom.sql`). Préférer des migrations qui **ajoutent** ; ne jamais renommer un fichier déjà appliqué.
- La base en ligne se met à jour seule : le workflow `.github/workflows/base-supabase.yml` lance `supabase db push` quand `supabase/migrations/**` change sur `main` ou sur une branche `lot-*`. Pousser la migration sur la branche du lot suffit ; vérifier ensuite le run et son journal dans l'onglet Actions.
- Une migration sur une autre branche ne s'applique pas : il faut l'accord de Cronos pour la mettre en ligne (pousser sur une branche `lot-*`).
- Ne jamais publier une version d'essai dont le code lit des colonnes ou des fonctions qui ne sont pas encore en ligne : le fil casserait pour tout le monde.
- Toute la sécurité est dans la base (RLS et fonctions qui vérifient le poste avec `private.require('écran')` ou `public.can('écran', 'lecture')`). L'interface ne fait que cacher ce qu'on ne peut pas faire.
- Essai de charge du vote (toute une salle vote à la même seconde) : workflow manuel « Essai de charge du vote » dans l'onglet Actions. Réussi le 30/10 ; à relancer avant la vraie AG, le vote de l'AG d'essai ouvert.
- Les réglages d'authentification de Supabase (adresses de retour, SMTP) se font dans le tableau de bord Supabase ou par le workflow (fichier `supabase/limites-connexion.json`).

## La version d'essai

- Construire avec `npm run build:domaine` pour app.aegb.fr (adresse des essais avec le bureau), ou `npm run build:pages` pour l'ancienne adresse en `/aegb-app/`. Le domaine principal aegb.fr reste à l'ancienne appli jusqu'au lancement.
- Copier `.env.example` en `.env.local` avant de construire, puis le supprimer.
- Publier le contenu de `dist/` dans la branche `gh-pages` (un commit signé Cronos). GitHub Pages sert cette branche.
- Avec un domaine à soi : construire à la racine (`BASE_PATH=/`), ajouter un fichier `CNAME` contenant l'adresse dans `gh-pages`, et ajouter l'adresse aux URL autorisées de Supabase.

## Style

Sobre, façon réseau social : fond gris uni, cartes blanches, un seul bleu (`#1B4DB1`), icônes pleines, police du système. Le vrai logo (`public/logo-rond.webp`, composant `Logo`). La pastille « ✓ Bureau » est réservée au compte AEGB ; un membre du bureau qui écrit en son nom montre son poste en un mot (« Admin », « Présidence »…). Les couleurs sont des jetons dans `src/index.css`, avec leur version sombre.

## Ce qui reste à faire avant le lancement

- Brancher HelloAsso (secrets GitHub) ; le paiement de 1 € de test est reporté.
- Vrai domaine, SMTP (emails), publication Android (Play Store) et guide iPhone.
- Effacer les comptes d'essai et rendre le journal ineffaçable.
- Mises à jour en arrière-plan : la nouvelle version s'installe sans déranger et se lance à l'ouverture suivante, retour à la version précédente en 30 secondes si elle bugue, et déploiement progressif à une partie des membres avant tout le monde.
