# AEGB

L'appli de l'Association des Étudiants Guinéens de Brest : un réseau privé pour les membres (fil, messages, cotisation, votes) et un mode bureau pour gérer l'association. Sur ordinateur, l'adresse principale montre aussi le site de présentation de l'asso.

Le travail avance par lots. Le lot 1 pose le socle : comptes et inscription, validation par le bureau, profils, postes et droits du bureau, journal d'activité, site de présentation.

## Lancer l'appli sur son ordinateur

Il faut Node.js 22 ou plus récent.

```sh
cp .env.example .env.local
npm install
npm run dev
```

L'appli s'ouvre sur http://localhost:5173.

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Lance l'appli en local |
| `npm run build` | Vérifie les types et prépare la version en ligne dans `dist/` |
| `npm run build:pages` | Même chose pour GitHub Pages (adresse en `/aegb-app/`) |
| `npm test` | Tests des fonctions d'affichage et de mot de passe |
| `npm run lint` | Relecture automatique du code |

## Organisation

- `src/pages/public` : site, connexion, inscription, charte.
- `src/pages/member` : écrans des membres (attente, bienvenue, profil).
- `src/pages/bureau` : mode bureau (tableau de bord, comptes, membres, postes, journal).
- `src/lib` : accès à Supabase, requêtes, mise en forme.
- `supabase/migrations` : la structure de la base, ses règles d'accès et ses fonctions.
- `supabase/tests` : un script qui vérifie les règles d'accès.

## La base Supabase

Toute la sécurité est dans la base : chaque table a des règles d'accès (RLS), et les actions du bureau passent par des fonctions qui vérifient le poste de la personne avant d'agir. L'interface ne fait que cacher ce qu'on ne peut pas faire.

- Un compte reste « en attente » tant que le bureau ne l'a pas validé, et ne voit rien des autres membres.
- Chaque poste du bureau ouvre certains écrans, en lecture ou en complet.
- L'admin numérique voit tout et ne peut pas être retiré. Ces droits restent secrets : la base ne laisse lire ni la colonne `locked` ni `assigned_by` de `bureau_roles`, et chacun obtient ses propres droits par la fonction `my_bureau()`. Pour les autres, ce poste apparaît comme un poste ordinaire sans accès.
- Ce que fait le titulaire de ce poste pour le bureau est signé « Le bureau » dans le journal, l'historique des fiches et les avertissements. Le vrai auteur est noté dans `private.discreet_actors`, que seul le titulaire relit (fonction `discreet_authors`).
- Le titulaire de ce poste le transmet lui-même à son successeur (« Transmettre » dans « Postes et droits », fonction `transfer_guarantor`). Le successeur garde son propre compte et reçoit tout de suite les mêmes droits.
- Tout le monde doit donner un prénom et un nom, sauf le titulaire de ce poste, qui peut n'avoir qu'un prénom.
- Le journal d'activité ne peut être ni modifié ni effacé, même par l'admin.

Pour vérifier les règles d'accès, colle `supabase/tests/socle_test.sql` dans l'éditeur SQL de Supabase. Le script se termine toujours par une erreur volontaire qui annule tout : le message doit commencer par « TESTS OK ».

### Réglages à faire dans Supabase

1. **Authentication → URL Configuration** : mettre l'adresse de l'appli en ligne comme *Site URL*, et l'ajouter aux *Redirect URLs* avec `**` à la fin (par exemple `https://cronos012.github.io/aegb-app/**`). Sans ça, les liens de confirmation et de mot de passe oublié renvoient au mauvais endroit.
2. **Authentication → Emails → SMTP Settings** : brancher un vrai service d'envoi (Brevo, par exemple) avant d'ouvrir les inscriptions. L'envoi par défaut de Supabase n'écrit qu'aux membres de l'équipe Supabase et seulement quelques emails par heure.

### Nommer le premier admin numérique

Le premier admin se nomme une seule fois, dans l'éditeur SQL, après avoir créé son compte dans l'appli et confirmé son email :

```sql
update public.profiles
   set status = 'actif', validated_at = now()
 where id = (select id from auth.users where email = 'adresse@exemple.fr');

update public.bureau_roles
   set holder_id = (select id from auth.users where email = 'adresse@exemple.fr'), assigned_at = now()
 where code = 'admin_numerique';
```

Ensuite, tout se fait depuis l'appli, dans « Postes et droits ».

## Sécurité du dépôt

Le dépôt est public. Les deux valeurs de `.env.example` sont publiques par nature. Il ne faut jamais y mettre la clé « secret » ou « service_role » de Supabase.
