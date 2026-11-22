# ORKESTRA

**Your business. Orchestrated.**

ORKESTRA est une plateforme SaaS multi-entreprises qui confie les tâches administratives et opérationnelles répétitives à des agents IA spécialisés, supervisés par un agent central : le **Manager Agent**.

Premier marché visé : les PME du bâtiment et de la maintenance (plombiers, électriciens, chauffagistes, entreprises de rénovation et de maintenance). L'architecture est prévue pour s'ouvrir à d'autres secteurs.

> **Statut : pré-alpha — fondations techniques.**
> Le monorepo, la configuration TypeScript, Next.js, Prisma et Vitest sont en place et vérifiés (typecheck, build et tests passent).
> Aucune fonctionnalité métier n'est encore implémentée : pas d'authentification, pas d'agents, pas de base de données remplie.

---

## Sommaire

- [Vision du produit](#vision-du-produit)
- [Avancement](#avancement)
- [Stack technique](#stack-technique)
- [Structure du projet](#structure-du-projet)
- [Installation](#installation)
- [Scripts disponibles](#scripts-disponibles)
- [Variables d'environnement](#variables-denvironnement)
- [Principes d'architecture](#principes-darchitecture)
- [Sécurité](#sécurité)
- [Méthode de travail](#méthode-de-travail)
- [Licence](#licence)

---

## Vision du produit

ORKESTRA aide les entreprises à gagner du temps, réduire les tâches répétitives et limiter les erreurs administratives. Ce n'est ni un outil de surveillance des salariés, ni un outil de remplacement du personnel.

| Agent | Rôle prévu |
|---|---|
| **Email Agent** | Classe les e-mails autorisés, identifie les demandes clients et les urgences, prépare des réponses. |
| **Document Agent** | Extrait et vérifie les données des documents, prépare devis et documents administratifs. |
| **Admin Agent** | Prépare rendez-vous et rappels, suit les tâches et les échéances. |
| **Manager Agent** | Supervise les autres agents à partir de leurs résultats réels (statuts, données, journaux), relance les tâches sans risque, crée des incidents, produit des rapports et suit les coûts. |

Le Manager Agent a une autonomie **intermédiaire** : il ne peut ni modifier ses propres permissions, ni supprimer les journaux d'audit, ni effectuer de paiement, ni envoyer de document sensible, ni prendre d'engagement contractuel sans validation humaine.

---

## Avancement

| Étape | Contenu | Statut |
|---|---|---|
| 1–3 | Analyse, inventaire, plan de développement | ✅ Terminé |
| 4 | Fondations techniques (monorepo, TypeScript, Next.js, Prisma, Vitest) | ✅ Squelette en place |
| — | Module authentification et accès (Better Auth, invitations, 2FA, rôles) | 🚧 En cours (lots A à F faits ; espaces par rôle et lot G à venir) |
| 5 | Interface et tableau de bord client | ⏳ À faire |
| 6 | Base de données et API | ⏳ À faire |
| 7 | Agents IA (Email, Document, Admin) | ⏳ À faire |
| 8 | Manager Agent | ⏳ À faire |
| 9 | Espace administrateur ORKESTRA | ⏳ À faire |
| 10 | Tests complets et sécurisation | ⏳ À faire |

---

## Stack technique

Versions réellement installées dans `pnpm-lock.yaml` :

| Outil | Version | Usage |
|---|---|---|
| Node.js | ≥ 22 | Environnement d'exécution |
| pnpm | 12.21 | Gestion du monorepo |
| TypeScript | 7.0 (strict) | Langage |
| Next.js | 16.4 (App Router) | Application web |
| React | 19.3 | Interface |
| Prisma | 7.10 | ORM — configuration dans `prisma.config.ts` |
| PostgreSQL | 16+ recommandé | Base de données |
| Zod | 4.6 | Validation des entrées |
| Vitest | 5.1 | Tests unitaires et d'intégration |

Prévus dans les prochaines étapes : Tailwind CSS, shadcn/ui, Better Auth, Resend, OpenAI API / Agents SDK, n8n, Stripe, Playwright.

---

## Structure du projet

```
ORKESTRA/
├── apps/
│   └── web/                  Application Next.js (App Router)
│       ├── app/
│       │   ├── (auth)/       Pages de connexion
│       │   ├── (dashboard)/  Espace client
│       │   ├── admin/        Espace administrateur ORKESTRA
│       │   └── api/          Routes API
│       ├── components/       ui, layout, dashboard, agents, admin
│       ├── lib/              Logique serveur partagée
│       └── hooks/            Hooks React
├── packages/
│   ├── ai/                   @orkestra/ai — agents, outils, prompts, orchestration
│   ├── database/             @orkestra/database — client Prisma et repositories
│   ├── validation/           @orkestra/validation — schémas Zod
│   └── shared/               @orkestra/shared — types, constantes, identité visuelle
├── prisma/
│   ├── schema.prisma         Schéma de la base (modèles ajoutés à l'étape 6)
│   └── seed.ts               Données de démonstration
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── prisma.config.ts          Configuration Prisma 7 (URL de la base)
├── vitest.config.ts
├── pnpm-workspace.yaml
├── tsconfig.json             Configuration TypeScript de base (strict)
└── .env.example              Modèle des variables d'environnement
```

---

## Installation

### 1. Prérequis

- **Node.js 22 ou plus récent** — vérifier avec `node -v`.
- **pnpm** — l'activer via Corepack (inclus avec Node.js) :
  ```bash
  corepack enable
  pnpm -v
  ```
- **PostgreSQL** — nécessaire à partir du module authentification.
- **Git**.

> ⚠️ Ne place pas le projet dans un dossier synchronisé (iCloud Drive, OneDrive, Dropbox). La synchronisation de `node_modules` et du dossier `.git` provoque lenteurs, fichiers verrouillés et corruptions. Utilise un dossier local (par exemple `C:\dev\ORKESTRA`) et GitHub comme sauvegarde.

### 2. Récupérer le projet

```bash
git clone https://github.com/thomaskongolo11/ORKESTRA.git
cd ORKESTRA
```

### 3. Configurer l'environnement

```bash
# macOS / Linux / PowerShell
cp .env.example .env
```

Puis renseigner au minimum `DATABASE_URL` dans `.env`.

### 3 bis. Windows : configuration automatique de PostgreSQL

Une fois PostgreSQL installé, ce script crée l'utilisateur `orkestra`, les bases `orkestra` et `orkestra_test`, remplit `.env`, applique les migrations et lance les tests (après `pnpm install` et `pnpm db:generate`) :

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-local-db.ps1
```

### 4. Installer, préparer la base et lancer

```bash
pnpm install
pnpm db:generate          # génère le client Prisma (packages/database/generated, non versionné)
pnpm db:migrate:deploy    # applique les migrations sur DATABASE_URL
pnpm dev
```

Pour les tests d'intégration, crée une base séparée (par exemple `orkestra_test`), renseigne `TEST_DATABASE_URL`, puis applique les migrations dessus :

```bash
# PowerShell
$env:DATABASE_URL = $env:TEST_DATABASE_URL; pnpm db:migrate:deploy
```

L'application est disponible sur <http://localhost:3000>.

### 5. Vérifier que tout fonctionne

```bash
pnpm typecheck
pnpm test
pnpm build
```

---

## Scripts disponibles

| Commande | Action |
|---|---|
| `pnpm dev` | Lance l'application web en développement |
| `pnpm build` | Compile l'application pour la production |
| `pnpm start` | Lance la version compilée |
| `pnpm typecheck` | Vérifie les types TypeScript de tout le monorepo |
| `pnpm test` | Exécute les tests Vitest |
| `pnpm test:watch` | Exécute les tests en continu |
| `pnpm test:e2e` | Tests de bout en bout dans un navigateur (Playwright) |
| `pnpm screenshots` | Captures d'écran des pages (dossier `screenshots/`) |
| `pnpm db:generate` | Génère le client Prisma |
| `pnpm db:migrate` | Crée et applique une migration Prisma |
| `pnpm db:seed` | Insère les données de démonstration |
| `pnpm db:studio` | Ouvre Prisma Studio |
| `pnpm admin:create` | Crée un compte SUPER_ADMIN (script local uniquement, 2FA imposée à la première connexion) |

---

## Variables d'environnement

Le fichier `.env.example` sert de modèle. Le fichier `.env` ne doit **jamais** être versionné.

| Variable | Obligatoire | Description |
|---|---|---|
| `DATABASE_URL` | Oui | Connexion PostgreSQL |
| `BETTER_AUTH_SECRET` | En production | Secret de l'authentification (32 caractères minimum) |
| `BETTER_AUTH_URL` | Oui | Adresse publique de l'application |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Non | Connexion Google (désactivée si vides) |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` | Non | Connexion Microsoft (désactivée si vides) |
| `TEST_DATABASE_URL` | Pour les tests | Base dédiée aux tests d'intégration |
| `EMAIL_MODE` | Oui | `simulated` (développement : aucun envoi réel, lien affiché dans le terminal) ou `resend` (envoi réel). `simulated` est refusé en production |
| `EMAIL_FROM` | En mode `resend` | Expéditeur, sur un domaine vérifié chez Resend |
| `EMAIL_REPLY_TO` | Non | Adresse de réponse |
| `RESEND_API_KEY` | En mode `resend` | Clé API Resend (serveur uniquement) |
| `OPENAI_API_KEY` | Non | Laisser vide tant que les dépenses API ne sont pas autorisées |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Non | Abonnements (étape ultérieure) |
| `N8N_BASE_URL`, `N8N_API_KEY` | Non | Intégrations (étape ultérieure) |
| `ORKESTRA_DEMO_MODE` | Oui | `true` : intégrations simulées, aucun appel externe |

Aucune variable secrète ne doit commencer par `NEXT_PUBLIC_` : ce préfixe rend la valeur visible dans le navigateur.

---

## Principes d'architecture

- **Multi-entreprise strict.** Chaque donnée métier est rattachée à une organisation. L'organisation active est déterminée côté serveur à partir de la session, jamais à partir d'une valeur envoyée par le navigateur.
- **Vérification réelle.** Le Manager Agent contrôle les résultats à partir des statuts d'exécution, des données produites et des journaux, en combinant contrôles déterministes et analyse IA.
- **Validation humaine.** Les agents préparent ; un humain valide les actions engageantes (devis, factures, paiements, contrats).
- **Démonstration transparente.** Toute donnée ou intégration simulée est identifiée comme telle. Aucune intégration n'est présentée comme fonctionnelle si elle est simulée.
- **Traitements longs en arrière-plan.** Les tâches des agents s'exécutent via des workers, pas dans les requêtes web.

---

## Sécurité

- Autorisation vérifiée **côté serveur** à chaque opération protégée ; les contrôles visuels du frontend ne suffisent jamais.
- Isolation des données entre organisations, couverte par des tests dédiés.
- Validation de toutes les entrées avec Zod.
- Journaux d'audit des événements sensibles.
- Clés API et secrets uniquement côté serveur.
- Authentification déléguée à une bibliothèque maintenue (Better Auth) : aucun système de mots de passe maison.
- Double authentification (TOTP) obligatoire pour les administrateurs de la plateforme.

Pour signaler une faille, ne crée pas d'issue publique : contacte directement le propriétaire du dépôt.

---

## Méthode de travail

Le développement avance **étape par étape**. On ne passe à l'étape suivante que si l'étape en cours ne comporte aucune erreur bloquante.

Avant chaque commit :

```bash
pnpm typecheck
pnpm test
```

Conventions :

- branche principale : `main` ;
- une branche par fonctionnalité (`feat/auth`, `feat/dashboard`…) ;
- messages de commit explicites, par exemple `feat(auth): add invitation tokens`.

---

## Licence

© 2026 Thomas Kongolo — Tous droits réservés.
Ce code est propriétaire. Toute copie, distribution ou utilisation sans autorisation écrite est interdite.
