# ORKESTRA

**Your business. Orchestrated.**

Plateforme SaaS multi-entreprises qui confie les tâches administratives répétitives à des agents IA spécialisés (Email, Document, Admin), supervisés par un Manager Agent.

> Statut : squelette du projet (étape 4 — fondations). Aucune fonctionnalité métier n'est encore implémentée.

## Structure

```
ORKESTRA/
├── apps/web/            Application Next.js (App Router)
│   ├── app/             (auth), (dashboard), admin, api
│   ├── components/      ui, layout, dashboard, agents, admin
│   ├── lib/
│   └── hooks/
├── packages/
│   ├── ai/              agents, tools, prompts, orchestration
│   ├── database/        client Prisma + repositories
│   ├── validation/      schémas Zod
│   └── shared/          types et constantes
├── prisma/              schema.prisma, seed.ts
└── tests/               unit, integration, e2e
```

## Démarrage

Prérequis : Node.js 22+, pnpm, PostgreSQL.

```bash
cp .env.example .env      # puis remplir DATABASE_URL
pnpm install
pnpm db:generate
pnpm dev
```

## Règles

- Le projet ne doit pas être placé dans un dossier synchronisé (iCloud, OneDrive) : utiliser un dossier local + Git.
- Les intégrations simulées sont identifiées comme telles (`ORKESTRA_DEMO_MODE`).
- Aucune clé API n'est exposée côté navigateur.
