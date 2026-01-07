# 🎮 Guild Reputation Engine

> On-chain reputation infrastructure for Gaming Guild DAOs

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Arbitrum](https://img.shields.io/badge/Arbitrum-Ready-blue.svg)](https://arbitrum.io/)

**Guild Reputation Engine** is an open-source reputation scoring system purpose-built for gaming guild DAOs. Track contributor value across gaming performance, governance participation, community engagement, and scholarship management.

Built for: **Treasure DAO**, **YGG**, **Merit Circle**, **Avocado DAO**, and similar organizations.

---

## 🚀 Features

- **📊 Multi-dimensional Scoring** - 6 categories: Gaming, Governance, Community, Treasury, Scholarship, Mentorship
- **🏆 Gamified Tiers** - Bronze → Silver → Gold → Platinum → Diamond → Master → Grandmaster
- **🏅 Achievement Badges** - Soulbound-style badges for milestones
- **⚖️ Customizable Weights** - Each guild configures what matters most
- **🔗 Multiple Data Sources** - Snapshot, Discord, on-chain, game APIs
- **🌐 REST API** - Easy integration with existing tools
- **⚡ Real-time Leaderboards** - Track top contributors

---

## 📦 Quick Start

```bash
# Clone the repo
git clone https://github.com/YourUsername/guild-reputation-engine.git
cd guild-reputation-engine

# Install dependencies
npm install

# Start development server
npm run dev

# Server runs at http://localhost:3000
```

### Calculate a Score (CLI)

```bash
npm run score 0xYourWalletAddress
```

---

## 🏗️ Architecture

```
src/
├── types/           # TypeScript interfaces
│   └── index.ts     # ReputationScore, Metrics, Badges, etc.
├── services/
│   └── ScoreCalculator.ts   # Core scoring algorithm
├── providers/
│   └── DataProviders.ts     # Snapshot, Discord, On-chain integrations
├── api/
│   └── server.ts    # Express REST API
└── index.ts         # Main exports + CLI
```

---

## 📊 Scoring System

### Categories & Default Weights

| Category | Weight | What It Tracks |
|----------|--------|----------------|
| Gaming | 30% | Matches played, win rate, tokens earned, NFT value |
| Governance | 25% | Voting participation, proposals created/passed, delegation |
| Community | 25% | Discord activity, events attended, guides created, referrals |
| Treasury | 10% | Financial contributions to guild |
| Scholarship | 5% | Scholars managed, retention rate, NFTs lent |
| Mentorship | 5% | Training sessions, onboarding help |

### Tier Thresholds

| Tier | Score Required |
|------|----------------|
| 💎 Grandmaster | 50,000+ |
| 🔥 Master | 25,000+ |
| 💠 Diamond | 10,000+ |
| ⚪ Platinum | 5,000+ |
| 🌟 Gold | 2,500+ |
| 🥈 Silver | 1,000+ |
| 🥉 Bronze | 0+ |

---

## 🔌 API Endpoints

```bash
# Get reputation score
GET /api/guilds/:guildId/reputation/:address

# Batch fetch scores
POST /api/guilds/:guildId/reputation/batch

# Leaderboard
GET /api/guilds/:guildId/leaderboard

# User badges
GET /api/guilds/:guildId/badges/:address

# Guild stats
GET /api/guilds/:guildId/stats

# Health check
GET /health
```

---

## ⚙️ Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Key variables:
- `ARBITRUM_RPC_URL` - Arbitrum RPC endpoint
- `DATABASE_URL` - PostgreSQL connection string
- `SNAPSHOT_HUB_URL` - Snapshot GraphQL endpoint

---

## 🎯 Target Ecosystems

### Primary: Arbitrum
- Treasure DAO ecosystem
- Gaming Catalyst Program projects

### Secondary: Solana
- YGG SubDAOs
- Star Atlas DAO

---

## 📄 License

MIT License

---

## 👨‍💻 Built By

**PineOT** - Web3 Development Agency
