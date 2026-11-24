# Anntel Marketing
### Plateforme centralisée de gestion marketing et prospection

Anntel Marketing est une application web conçue pour centraliser les opérations marketing et commerciales dans un seul espace. Elle permet de gérer les campagnes, les contacts, les équipes, les tâches et les communications, tout en organisant les accès selon les responsabilités de chaque utilisateur.

**Dépôt du projet :** https://github.com/yassinelmiri/marketing  
**Branche de développement :** `chatgpt`

---

## 1. Présentation et objectifs

La plateforme vise à simplifier le travail quotidien des équipes marketing et commerciales en réunissant leurs outils dans une interface unique.

Ses principaux objectifs :
- Centraliser les informations des contacts et des prospects.
- Organiser les campagnes et suivre leur avancement.
- Faciliter la répartition et le suivi du travail entre collaborateurs.
- Préparer et gérer les communications par e-mail, SMS et WhatsApp selon le niveau d'intégration disponible.
- Sécuriser les données et limiter l'accès aux fonctionnalités selon les rôles et autorisations.

## 2. Pages et modules de l'application

### Tableau de bord
- Vue synthétique de l'activité marketing.
- Accès rapide aux principales rubriques.
- Indicateurs et informations utiles au suivi de l'activité.

### Campagnes
- Consultation et organisation des campagnes.
- Création, modification et suppression des campagnes selon les droits.
- Association des campagnes aux listes de contacts.
- Suivi de l'état d'avancement : brouillon, en cours ou terminée selon les statuts utilisés.
- Espace de suivi et commentaires liés aux campagnes.

### Listes & contacts
- Création et gestion des listes de contacts.
- Ajout, consultation et organisation des contacts.
- Association des contacts à une ou plusieurs listes.
- Recherche et filtrage pour retrouver plus facilement les informations.
- Import et export de fichiers de contacts CSV/XLSX lorsque le module correspondant est configuré.

### Équipe
- Consultation des membres de l'équipe.
- Affichage des informations de profil et des rôles.
- Accès aux informations limité par les autorisations du compte.

### Gestion des tâches
- Création et suivi des tâches.
- Attribution des tâches aux membres concernés.
- Consultation des tâches et de leur état d'avancement.
- Organisation du travail et meilleure visibilité sur les responsabilités de chacun.

### Notifications
- Centre de notifications accessible depuis l'espace de travail.
- Alertes destinées à attirer l'attention sur les événements et activités de l'équipe, selon les événements pris en charge.

### Envoi d'e-mails
- Configuration de plusieurs comptes expéditeurs SMTP.
- Sélection d'une liste de contacts comme destinataire d'une campagne.
- Préparation et envoi de messages e-mail via les comptes SMTP configurés.
- Consultation de l'historique des campagnes e-mail.
- Chiffrement côté serveur des mots de passe SMTP enregistrés.

### SMS
- Interface de préparation d'un message SMS.
- Sélection d'une liste cible et affichage du nombre de contacts concernés.
- Contrôle de la longueur du message et affichage d'un historique dans l'interface.

**Important :** dans la version actuelle du dépôt, l'envoi SMS est une simulation côté interface. Un fournisseur SMS et son intégration backend doivent être configurés pour effectuer de véritables envois.

### Campagnes WhatsApp
- Import des contacts depuis les fichiers XLSX, XLS et CSV.
- Détection de la colonne téléphone, normalisation des numéros marocains et internationaux, suppression des doublons et comptage des numéros invalides.
- Préparation d'un message avec les variables `{nom}` et `{tel}`.
- Ouverture de WhatsApp Web dans un onglet séparé pour scanner le QR code si nécessaire.
- Ouverture successive de chaque conversation avec le texte prérempli ; l'utilisateur vérifie le destinataire et clique lui-même sur Envoyer.
- Après confirmation manuelle d'un contact, passage automatique au contact suivant après un délai réglable (0 à 120 secondes) ; la pause/reprise conserve le suivi et l'avancement.
- Suivi manuel des contacts confirmés, en échec ou ignorés, avec pause/reprise et export XLSX du résultat.

**Limites importantes :** il s'agit d'un mode assisté, pas d'un robot d'envoi automatique. L'application ne peut pas vérifier qu'un message a réellement été envoyé : le statut « confirmé » dépend de l'action manuelle de l'utilisateur. Les campagnes et le suivi des destinataires sont sauvegardés dans Supabase après application de la migration WhatsApp. Utilisez uniquement des contacts ayant donné leur accord et respectez les demandes de désinscription. WhatsApp Web reste un service tiers susceptible de modifier son interface ou ses conditions d'utilisation.

### Administration
- Gestion des comptes utilisateurs.
- Attribution des rôles.
- Gestion des autorisations d'accès aux modules.
- Contrôle des permissions accordées aux utilisateurs.

### Paramètres
- Consultation et mise à jour des informations personnelles disponibles.
- Gestion des paramètres du profil et du mot de passe selon les fonctions activées.

## 3. Gestion des rôles et des autorisations

L'application prévoit une gestion des accès par rôle et par permission.

- **Administrateur :** gestion globale de l'espace, des utilisateurs, des rôles et des autorisations.
- **Manager :** accès aux modules qui lui sont accordés par les permissions configurées.
- **Membre :** accès limité aux pages et actions autorisées pour son compte.

Les permissions sont contrôlées à partir des données de l'application. Les pages visibles et les actions accessibles dépendent du rôle, des autorisations héritées et des éventuelles dérogations individuelles.

## 4. Expérience utilisateur et interface

- Interface centralisée avec navigation entre les modules.
- Mode sombre et mode clair.
- Présentation responsive adaptée aux différentes tailles d'écran.
- Composants visuels et icônes pour faciliter la lecture.
- Notifications et retours visuels lors des actions.
- Organisation des pages pour faciliter la recherche d'informations et le suivi de l'activité.

## 5. Technologies utilisées

| Domaine | Technologie |
| --- | --- |
| Framework web | Next.js 16 – App Router |
| Interface | React 19 |
| Langage | TypeScript |
| Base de données | PostgreSQL via Supabase |
| Authentification | Supabase Auth |
| Sécurité des données | Row Level Security (RLS) |
| Temps réel | Supabase Realtime |
| E-mails | Nodemailer et comptes SMTP |
| Import / export | XLSX |
| Icônes | Lucide React |

## 6. Architecture du projet

```text
app/                       Pages Next.js et routes API
components/marketing/      Modules et vues de l'espace marketing
components/ui/              Composants d'interface réutilisables
lib/                        Fonctions métier et accès aux données
lib/supabase/                Clients Supabase et services de données
supabase/migrations/         Migrations SQL versionnées
.env.example                 Modèle des variables d'environnement
```

## 7. Sécurité et protection des données

- Authentification des utilisateurs avec Supabase Auth.
- Contrôle des accès par rôles et permissions.
- Utilisation des politiques Row Level Security (RLS) pour protéger les données.
- Conservation des clés sensibles côté serveur uniquement.
- Chiffrement côté serveur des mots de passe SMTP stockés.
- Séparation des paramètres locaux et du code versionné.
- Les secrets et fichiers `.env.local` ne doivent jamais être publiés dans Git.

La sécurité finale dépend également de la bonne configuration des politiques RLS, des variables d'environnement, des droits Supabase et de l'hébergement.

## 8. Installation et lancement

### Prérequis
- Node.js compatible avec Next.js 16.
- pnpm.
- Un projet Supabase configuré.

### Installation

```bash
git clone https://github.com/yassinelmiri/marketing.git
cd marketing
git checkout chatgpt
pnpm install
```

### Configuration

Créer le fichier local :

```powershell
Copy-Item .env.example .env.local
```

Renseigner les variables nécessaires dans `.env.local` :

| Variable | Utilisation |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clé publique Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé serveur privée, jamais exposée au navigateur |
| `SMTP_ENCRYPTION_KEY` | Clé hexadécimale de 64 caractères utilisée pour chiffrer les identifiants SMTP |

Générer une clé de chiffrement SMTP :

```bash
openssl rand -hex 32
```

Conserver cette clé de façon sécurisée et stable. La modification de cette clé peut empêcher le déchiffrement des mots de passe SMTP déjà enregistrés.

### Base de données

1. Ouvrir le SQL Editor du projet Supabase.
2. Exécuter les migrations présentes dans `supabase/migrations/` dans l'ordre chronologique.
3. Vérifier les tables, fonctions et politiques RLS nécessaires.
4. Configurer les rôles, permissions et profils utilisateurs.

### Démarrage en développement

```bash
pnpm dev
```

Ouvrir http://localhost:3000.

### Vérification et démarrage en production

```bash
pnpm build
pnpm start
```

## 9. État des intégrations

| Module | État documenté dans le code |
| --- | --- |
| Authentification Supabase | Intégrée |
| Tableau de bord | Présent |
| Campagnes | Présent |
| Listes et contacts | Présent |
| Gestion des rôles et permissions | Intégrée |
| Tâches | Présent |
| Notifications | Présent |
| Envoi e-mail SMTP | Intégré, nécessite des comptes SMTP valides et la configuration serveur |
| SMS | Interface de simulation ; fournisseur et backend réels à intégrer |
| WhatsApp Web | Mode assisté intégré avec sauvegarde Supabase, ouverture des conversations et progression automatique de la file après confirmation manuelle ; aucun envoi automatique |

Ce tableau distingue volontairement les interfaces disponibles des intégrations externes réellement opérationnelles. Les fonctionnalités doivent être validées dans l'environnement de déploiement avant toute présentation comme service en production.

## 10. Bénéfices pour l'organisation

- **Centralisation :** les données, campagnes et outils de travail sont réunis dans une seule plateforme.
- **Gain de temps :** les équipes retrouvent plus rapidement les contacts, les campagnes et les tâches.
- **Meilleure coordination :** les tâches attribuées et les notifications facilitent le suivi du travail collectif.
- **Suivi de l'activité :** les campagnes et les listes sont organisées pour améliorer la visibilité opérationnelle.
- **Maîtrise des accès :** chaque utilisateur accède uniquement aux modules qui lui sont autorisés.
- **Évolutivité :** l'architecture permet d'ajouter progressivement de nouveaux services et intégrations.
- **Personnalisation :** les modules et les autorisations peuvent être adaptés aux besoins de l'organisation.

## 11. File d'envoi des campagnes e-mail (branche chatgpt)

- Les campagnes peuvent cibler plusieurs listes ; les doublons d'adresses sont supprimés avant l'ajout à la file.
- Une campagne peut être lancée immédiatement ou planifiée à une date/heure donnée.
- Plusieurs comptes SMTP actifs peuvent être sélectionnés pour une campagne ; le worker distribue les destinataires à tour de rôle entre les expéditeurs sélectionnés.
- Le traitement s'effectue côté serveur par lots, sans garder l'écran de préparation ouvert. Jusqu'à trois campagnes peuvent être traitées simultanément par le worker.
- Le worker Vercel est appelé chaque minute (`vercel.json`). Les lots traités dans une même exécution respectent le délai configuré ; si la campagne dépasse la durée d'une exécution, la reprise dépend du prochain passage du cron et peut donc ajouter jusqu'à environ une minute de décalage.

### Configuration nécessaire

1. Appliquer les nouvelles migrations `20261124180000_email_campaign_queue.sql` et `20261124181000_email_campaign_sent_timestamp.sql` dans Supabase, après les migrations e-mail précédentes.
2. Appliquer aussi la migration `20261124183000_email_campaign_multiple_senders.sql` pour activer la sélection de plusieurs comptes SMTP.
3. Ajouter une variable d'environnement Vercel `CRON_SECRET` contenant une valeur aléatoire longue et privée. Ne jamais la committer dans Git.
4. Redéployer le projet pour activer le cron `/api/cron/email-campaigns`.
5. Vérifier le premier lancement avec une petite campagne de test et un compte SMTP valide.

Le code de cette évolution est sur la branche `chatgpt` ; il n'est pas fusionné dans `main`.

## 12. Contact et informations

- **Nom du projet :** Anntel Marketing
- **Dépôt GitHub :** https://github.com/yassinelmiri/marketing
- **Branche de travail e-mail :** `chatgpt`

---

*Document de présentation fonctionnelle et technique. Les fonctionnalités dépendant de services externes (SMTP, SMS, WhatsApp, hébergement et Supabase) doivent être configurées et testées dans l'environnement cible avant leur mise en production.*


### Persistance des campagnes WhatsApp
- Les campagnes WhatsApp assistées et leurs destinataires sont enregistrés dans Supabase.
- Une campagne peut être rechargée après fermeture ou actualisation de la page, avec le statut de chaque destinataire et le dernier contact à traiter.
- Le message, la pause/reprise et les statuts des destinataires sont sauvegardés via une API serveur authentifiée.
- Les tables sont protégées par RLS sans accès direct depuis le navigateur ; l'API vérifie l'utilisateur et la permission `whatsapp.access`.
- Migration à appliquer : `supabase/migrations/20261124190000_whatsapp_campaign_persistence.sql`.
- Les statuts « Envoyé » restent des confirmations manuelles de l'utilisateur ; l'application ne lit pas les confirmations WhatsApp et n'envoie aucun message automatiquement. Le délai de passage au contact suivant est réglable dans l'interface ; l'utilisateur garde le contrôle de chaque clic sur Envoyer.
