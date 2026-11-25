# Architecture technique — CRM, Email Marketing et SMTP

Branche de référence : `chatgpt`  
Dépôt : `yassinelmiri/marketing`

## 1. Décision d'architecture

Le moteur d'envoi retenu est **SMTP uniquement**, avec Nodemailer. Le projet possède déjà une première implémentation fonctionnelle du parcours SMTP. Cette architecture doit être consolidée et étendue, pas remplacée par un second moteur.

Principes :
- Les identifiants SMTP restent côté serveur.
- Les mots de passe SMTP sont chiffrés avec AES-256-GCM avant stockage.
- La préparation d'une campagne est séparée de son exécution.
- Les destinataires et les événements sont persistés dans Supabase.
- Un worker planifié traite la file en arrière-plan.
- Les permissions applicatives et RLS doivent limiter l'accès aux campagnes, listes et contacts.

## 2. Éléments déjà présents sur la branche

| Élément | État constaté dans le code |
| --- | --- |
| Nodemailer | Dépendance installée |
| Comptes SMTP | API de création, consultation, modification, suppression et test |
| Chiffrement des mots de passe | AES-256-GCM dans `lib/supabase/smtp-crypto.ts` |
| Campagnes multi-listes | Pris en charge par l'API de création |
| Plusieurs expéditeurs SMTP | Sélection et distribution entre les comptes sélectionnés |
| File de destinataires | Table `email_campaign_recipients` utilisée par le worker |
| Envoi par lots | Paramètres `batch_size` et `batch_delay_seconds` |
| Planification | `scheduled_at` et `next_batch_at` |
| Exécution en arrière-plan | Route `/api/cron/email-campaigns` |
| Exécution concurrente | Jusqu'à trois campagnes prises par une exécution cron |
| Pause / reprise | Actions de campagne via l'API |
| Tracking | Événements d'ouverture et de clic |
| Désabonnement | Tokens et liste d'exclusion avant l'envoi |
| Historique | Compteurs, destinataires et logs de livraison |

### Limites actuelles observées

- Le worker cron est configuré à une fréquence d'une minute dans `vercel.json`.
- Le worker traite au maximum trois campagnes par passage.
- La concurrence par campagne est plafonnée à dix destinataires, avec une valeur par défaut de cinq.
- L'API limite actuellement une campagne à 5 000 destinataires.
- Le tracking d'ouverture dépend du chargement du pixel par le logiciel de messagerie ; il ne représente donc pas une mesure exacte des lectures.
- Le tracking des clics ne mesure que les liens HTTP(S) réécrits dans le HTML.
- Les détails d'activité affichés dans le tableau de bord doivent être paginés côté interface pour les gros volumes.
- Les comptes SMTP doivent être testés avec le fournisseur réel ; une vérification SMTP réussie ne garantit pas la délivrabilité.

## 3. Flux d'envoi cible

1. L'utilisateur crée ou sélectionne un compte SMTP administré.
2. Il prépare une campagne : expéditeurs, listes, sujet, contenu, options de tracking et date de lancement.
3. L'API vérifie la session, la permission `email.access`, les expéditeurs actifs et les listes sélectionnées.
4. Les adresses sont normalisées, dédupliquées et filtrées contre la liste de désabonnement.
5. La campagne et ses destinataires sont enregistrés dans Supabase avec le statut `pending` ou `scheduled`.
6. Le cron appelle le worker avec un secret serveur.
7. Le worker réclame une campagne à l'aide d'un verrou, vérifie les comptes SMTP, puis envoie les destinataires par lots.
8. Chaque résultat met à jour le destinataire et ajoute une ligne d'historique.
9. La campagne passe à `sent`, `partial`, `failed` ou reste `sending` selon le résultat.
10. Les événements d'ouverture, de clic et de désabonnement alimentent les statistiques.

## 4. Modèle de données

### Tables existantes utilisées par le module

- `smtp_accounts` : comptes SMTP et mots de passe chiffrés.
- `email_campaigns` : configuration, planification et compteurs de campagne.
- `email_campaign_recipients` : file individuelle des destinataires.
- `email_delivery_logs` : résultat de livraison par destinataire.
- `email_campaign_events` : événements d'ouverture et de clic.
- `email_unsubscribes` : adresses exclues.
- `email_unsubscribe_tokens` : tokens de désabonnement.

### Extensions proposées pour les prochaines phases

- `email_campaign_recipients` : ajouter un identifiant de tentative et un nombre de tentatives si ces champs ne sont pas déjà présents.
- `email_delivery_logs` : conserver un code d'erreur normalisé en plus du message lisible.
- `email_campaigns` : conserver une raison de fin et les horodatages de pause/reprise si le suivi opérationnel l'exige.
- CRM : ajouter progressivement tags, activités, segments et scoring sans remplacer les tables `contacts`, `listes` et `liste_contacts`.

Toute extension de schéma doit commencer par vérifier les migrations déjà appliquées et les colonnes existantes. Ne pas créer de doublons de tables ou de colonnes.

## 5. API existantes

| Route | Rôle |
| --- | --- |
| `/api/email/smtp-accounts` | Gérer et tester les comptes SMTP |
| `/api/email/campaigns` | Créer, modifier, mettre en pause et reprendre les campagnes |
| `/api/email/send` | Consulter l'historique et les détails d'activité |
| `/api/cron/email-campaigns` | Traiter la file côté serveur |
| `/api/email/track/open` | Enregistrer un événement d'ouverture |
| `/api/email/track/click` | Enregistrer un clic puis rediriger |
| `/api/email/unsubscribe/[token]` | Gérer le désabonnement |
| `/api/email/templates` | Gérer les modèles d'e-mail |

## 6. Sécurité et fiabilité — travaux à valider avant extension

1. **Autorisation des listes** : vérifier côté serveur qu'un membre ne peut créer une campagne qu'avec les listes auxquelles il a réellement accès. Ne pas se fier aux listes filtrées uniquement par l'interface.
2. **Verrou du worker** : conserver une réclamation atomique de campagne et vérifier le comportement en cas de deux exécutions cron simultanées.
3. **Pause et reprise** : tester les transitions lorsque le worker est en cours d'envoi, afin qu'aucun lot supplémentaire ne parte après une pause confirmée.
4. **Idempotence** : éviter de renvoyer un destinataire déjà marqué comme envoyé si une exécution échoue entre l'envoi SMTP et l'enregistrement du résultat. SMTP ne fournit pas de transaction exactement-une-fois ; prévoir un état d'envoi et une stratégie de reprise explicite.
5. **Erreurs temporaires** : distinguer les erreurs SMTP temporaires des erreurs permanentes ; appliquer des tentatives limitées avec backoff pour les erreurs temporaires.
6. **Secrets** : ne jamais renvoyer `password_encrypted` ou le mot de passe déchiffré au navigateur et ne jamais les écrire dans les logs.
7. **Validation des paramètres** : valider aussi les modifications SMTP (email, host, port, username) et exiger un nouveau mot de passe uniquement lorsqu'il est remplacé.
8. **Désabonnement** : continuer à exclure les adresses désabonnées juste avant l'envoi, et respecter les demandes de désabonnement.
9. **Limites SMTP** : définir les limites par compte et surveiller les réponses du fournisseur pour éviter les blocages.
10. **Observabilité** : afficher les erreurs utiles aux administrateurs sans exposer les identifiants ou détails secrets.

## 7. Paramètres d'envoi

Valeurs initiales proposées, à adapter aux limites réelles du fournisseur SMTP :

| Paramètre | Valeur initiale |
| --- | ---: |
| Taille d'un batch | 50 |
| Concurrence par campagne | 3 à 5 |
| Délai entre batches | 5 à 30 secondes |
| Tentatives sur erreur temporaire | 3 maximum |
| Campagnes simultanées | 3 au départ |
| Destinataires par campagne | Limite applicative actuelle : 5 000 |

Ces valeurs ne sont pas des garanties de capacité SMTP. Elles doivent être configurables et rester inférieures aux limites du fournisseur.

## 8. Plan d'implémentation

### Phase A — Audit et sécurisation du SMTP existant
- Vérifier les migrations SQL réellement appliquées.
- Tester les permissions Admin / Manager / Member.
- Vérifier les droits d'accès aux listes côté API.
- Renforcer la validation des comptes SMTP.
- Vérifier les verrous, la pause/reprise et la reprise après erreur.
- Tester les cas de doublon et d'échec SMTP.

### Phase B — CRM & Contacts
- Dashboard CRM.
- Fiche détaillée d'un contact et historique des interactions.
- Tags et segments.
- Import CSV/XLSX avec prévisualisation et détection des doublons.
- Export et actions groupées.
- Lead scoring après validation des règles métier.

### Phase C — Email Marketing
- Dashboard avec statistiques fiables.
- Éditeur et bibliothèque de templates.
- Prévisualisation desktop/mobile et email de test.
- Préparation de campagne avec listes, expéditeurs, calendrier et paramètres de batch.
- Historique détaillé paginé.

### Phase D — Automatisation et optimisation
- Relances selon des événements et délais.
- A/B testing.
- Rapports par campagne et par segment.
- Alertes de délivrabilité et suivi des quotas SMTP.

## 9. Configuration de déploiement

Variables serveur nécessaires :

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SMTP_ENCRYPTION_KEY` : 64 caractères hexadécimaux.
- `CRON_SECRET` : secret long et aléatoire.
- `APP_URL` ou `NEXT_PUBLIC_APP_URL` : origine publique de l'application recommandée pour les liens de tracking et de désabonnement.

Ne jamais committer les secrets. Toute modification de `SMTP_ENCRYPTION_KEY` nécessite une stratégie de migration des mots de passe déjà chiffrés.

## 10. Tests d'acceptation

- Un membre non autorisé ne peut ni lire ni lancer une campagne.
- Un membre ne peut pas utiliser une liste non assignée.
- Un mot de passe SMTP n'est jamais exposé dans les réponses API.
- Un compte SMTP invalide affiche une erreur compréhensible sans révéler de secret.
- Une campagne planifiée ne démarre pas avant son heure.
- Une campagne en pause ne reçoit pas de nouveaux lots.
- Une campagne reprise continue sans renvoyer les destinataires déjà confirmés comme envoyés.
- Les doublons et désabonnés sont exclus.
- Les erreurs temporaires et permanentes sont différenciées.
- Les compteurs du tableau de bord correspondent aux destinataires persistés.
- Les liens de désabonnement fonctionnent et empêchent les prochains envois à cette adresse.

---
Document de préparation technique. Les éléments existants ont été repérés dans le code de la branche `chatgpt`, mais les migrations, variables d'environnement, tests SMTP et comportements de production doivent être vérifiés dans le projet Supabase et l'hébergement réels avant validation.
