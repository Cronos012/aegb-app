# AEGB

L'appli de l'Association des Étudiants Guinéens de Brest : un réseau privé pour les membres (fil, messages, cotisation, votes) et un mode bureau pour gérer l'association. Sur ordinateur, l'adresse principale montre aussi le site de présentation de l'asso.

Pour reprendre le travail, lire d'abord `AGENTS.md` (méthode et règles).

Le travail avance par lots. Le lot 1 pose le socle : comptes et inscription, validation par le bureau, profils, postes et droits du bureau, journal d'activité, site de présentation. Le lot 2 ouvre le fil d'actu : publications avec photos ou vidéo, réactions, commentaires, signalements, modération, annonces officielles du bureau, profils des membres, annuaire et recherche.

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
| `npm run build:domaine` | Même chose pour l'adresse des essais, app.aegb.fr |
| `npm test` | Tests des fonctions d'affichage et de mot de passe |
| `npm run lint` | Relecture automatique du code |

## Organisation

- `src/pages/public` : site, connexion, inscription, charte.
- `src/pages/member` : écrans des membres (fil, publier, profils, annuaire, recherche, menu, messages).
- `src/pages/bureau` : mode bureau (tableau de bord, comptes, membres, annonces, modération, compte AEGB, postes, journal).
- `src/components/feed` : les morceaux du fil (carte de publication, réactions, commentaires, photos).
- `src/components/messages` : les morceaux de la messagerie (liste, bulles, saisie, vocal).
- `src/components/dues` : les morceaux de la cotisation (grille des mois, paiement, encaissement).
- `src/lib` : accès à Supabase, requêtes, mise en forme.
- `supabase/migrations` : la structure de la base, ses règles d'accès et ses fonctions.
- `supabase/tests` : les scripts qui vérifient les règles d'accès.
- `supabase/functions/helloasso` : la fonction serveur qui parle à HelloAsso (paiement par carte).

## La base Supabase

Toute la sécurité est dans la base : chaque table a des règles d'accès (RLS), et les actions du bureau passent par des fonctions qui vérifient le poste de la personne avant d'agir. L'interface ne fait que cacher ce qu'on ne peut pas faire.

- Un compte reste « en attente » tant que le bureau ne l'a pas validé, et ne voit rien des autres membres.
- Chaque poste du bureau ouvre certains écrans, en lecture ou en complet.
- L'admin numérique voit tout et ne peut pas être retiré. Ces droits restent secrets : la base ne laisse lire ni la colonne `locked` ni `assigned_by` de `bureau_roles`, et chacun obtient ses propres droits par la fonction `my_bureau()`. Pour les autres, ce poste apparaît comme un poste ordinaire sans accès.
- Ce que fait le titulaire de ce poste pour le bureau est signé « Le bureau » dans le journal, l'historique des fiches et les avertissements. Le vrai auteur est noté dans `private.discreet_actors`, que seul le titulaire relit (fonction `discreet_authors`).
- Le titulaire de ce poste le transmet lui-même à son successeur (« Transmettre » dans « Postes et droits », fonction `transfer_guarantor`). Le successeur garde son propre compte et reçoit tout de suite les mêmes droits.
- Tout le monde doit donner un prénom et un nom, sauf le titulaire de ce poste, qui peut n'avoir qu'un prénom.
- Le journal d'activité ne peut pas être modifié. Pendant les essais, le titulaire du poste d'admin numérique peut le vider (« Vider le journal », fonction `clear_journal`). Au lancement officiel, il le rend ineffaçable (« Rendre ineffaçable », fonction `lock_journal`) : ce verrou est définitif.

### Le fil d'actu (lot 2)

- Seuls les membres validés voient le fil et y publient : du texte (2 000 caractères au plus), jusqu'à 4 photos ou une vidéo seule (15 Mo). Les photos sont réduites dans le téléphone avant l'envoi et rangées dans l'espace privé `publications`, dans le dossier de leur auteur.
- Chacun réagit une fois par publication ou commentaire (six réactions, pas de « je n'aime pas »). Les réponses aux commentaires restent sur un seul niveau.
- Un signalement est anonyme : le bureau voit le nombre et les motifs, jamais qui a signalé. La modération garde, masque, ou masque et avertit l'auteur ; elle peut aussi masquer sans signalement. L'auteur voit toujours ce qui a été masqué, avec le motif. Chaque décision va au journal.
- Les annonces officielles sont signées « AEGB » avec la pastille Bureau, s'adressent à tous, aux étudiants, aux alumni ou au bureau, et restent épinglées 7 jours. Elles peuvent être programmées (jusqu'à 90 jours). Le bureau des annonces voit qui les a écrites et combien de membres les ont vues.
- Ceux qui ont le droit « Annonces » peuvent aussi publier, commenter et réagir au nom de l'AEGB, depuis le fil (choix « Moi / AEGB », qui revient sur « Moi » à chaque fois). Les membres voient « AEGB » ; le bureau des annonces voit qui a écrit. Une publication AEGB sans titre ne prévient personne, et un écrit AEGB ne se signale pas.

### Les messages (lot 3)

- Messages privés entre membres validés, petits groupes (100 membres au plus) et grand groupe AEGB : chaque membre validé y entre tout seul et ne peut pas le quitter.
- Dans un message : du texte (4 000 caractères), jusqu'à 10 photos réduites avant l'envoi, un vocal (2 minutes) ou un document (PDF, Word, Excel, PowerPoint ou texte, 10 Mo). Les fichiers sont rangés dans l'espace privé `messages`, dans le dossier de la conversation : seuls ses membres les ouvrent.
- On réagit, on répond en citant, on supprime pour tous. « Vu » apparaît dans les conversations privées.
- Bloquer un membre : ses messages privés n'arrivent plus, sans qu'il le sache.
- Le compte officiel AEGB : chaque membre a une conversation avec lui. Le bureau y répond au nom d'AEGB ; le membre ne voit jamais qui a répondu, le bureau si. À la validation d'un compte, AEGB envoie le message de bienvenue (modifiable dans « Compte AEGB ») et annonce l'arrivée dans le grand groupe.
- Un message signalé arrive en modération seul : le bureau ne voit jamais le reste de la conversation.

### Les cotisations (lot 4)

- L'année va de janvier à décembre, comme l'exercice comptable et le mandat du bureau ; l'assemblée générale de décembre fixe le montant de l'année suivante. Le montant par mois, la date de début et les types de membres qui cotisent se règlent dans « Réglages de la cotisation ». Un membre arrivé en cours d'année ne doit que les mois à partir de sa validation.
- Comme le disent les statuts (article 32), dès qu'un mois passé n'est pas payé, le droit de vote et l'éligibilité d'un étudiant sont suspendus. Après trois mois de retard et un rappel resté sans effet (la relance du 1er du mois), le bureau peut prononcer la radiation. La solidarité (article 30) ne dépend pas de la cotisation.
- Le membre paie par carte avec HelloAsso, un ou plusieurs mois d'un coup, jusqu'en décembre (l'année suivante s'ouvre le 1er décembre). Un paiement par carte n'est compté que lorsque HelloAsso le confirme : la fonction serveur relit toujours le paiement chez HelloAsso, elle ne croit jamais l'appli ni la notification seule.
- Le bureau encaisse les espèces, virements et chèques. Chaque paiement donne une quittance numérotée (2026-0001, 2026-0002…), en PDF, envoyée au membre dans sa conversation AEGB.
- Le journal financier ne se modifie pas et ne s'efface pas. Une erreur se corrige par une contre-passation : une écriture inverse, et les deux restent visibles. Un remboursement se fait dans HelloAsso, puis on passe la contre-passation.
- Le 1er de chaque mois, AEGB envoie un rappel aux membres en retard (une fois par mois, réglage « Relance automatique »).
- Seuls les postes qui ont l'écran « Trésorerie » voient l'argent des autres.

Pour brancher HelloAsso, il faut quatre secrets de plus dans GitHub (Settings → Secrets and variables → Actions) : `HELLOASSO_CLIENT_ID` et `HELLOASSO_CLIENT_SECRET` (HelloAsso → Mon compte → Intégrations et API), `HELLOASSO_ORG` (le nom de l'asso dans l'adresse de sa page HelloAsso) et `HELLOASSO_ENV` (`sandbox` pour les essais, `production` pour le vrai). Dans HelloAsso, l'adresse de notification à donner est `https://lahllstfpmjfcavptlmt.supabase.co/functions/v1/helloasso`. Tant que ces secrets manquent, l'appli dit que le paiement par carte n'est pas encore branché, et le bureau peut quand même encaisser à la main.

Pour vérifier les règles d'accès, colle `supabase/tests/socle_test.sql`, puis `supabase/tests/fil_test.sql`, puis `supabase/tests/messages_test.sql`, puis `supabase/tests/cotisations_test.sql`, dans l'éditeur SQL de Supabase. Chaque script se termine par une erreur volontaire qui annule tout : le message doit commencer par « TESTS OK ».

### Mettre la base à jour

La base en ligne se met à jour toute seule : quand un fichier de `supabase/migrations` change sur `main` ou sur une branche `lot-…`, GitHub lance « Base Supabase » (`.github/workflows/base-supabase.yml`), qui applique les migrations pas encore passées. Il lui faut deux secrets, à mettre une seule fois dans GitHub (Settings → Secrets and variables → Actions) :

- `SUPABASE_ACCESS_TOKEN` : un jeton créé dans Supabase, Account → Access Tokens.
- `SUPABASE_DB_PASSWORD` : le mot de passe de la base (Project Settings → Database ; « Reset database password » si on ne l'a plus, l'appli ne s'en sert pas).

Le même travail publie la fonction serveur HelloAsso et lui passe ses secrets, s'ils sont dans GitHub.

Chaque fichier de migration porte le numéro enregistré dans la base : ne jamais renommer un fichier déjà appliqué.

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
