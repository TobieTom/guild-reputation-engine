/**
 * Guild Reputation Engine - REST API Server
 * 
 * Provides endpoints for:
 * - Fetching individual reputation scores
 * - Leaderboards
 * - Badge queries
 * - Guild configuration
 * 
 * @author PineOT (Tobias)
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { GuildScoreCalculator } from '../services/ScoreCalculator';
import { MockDataProvider, AggregatedDataProvider } from '../providers/DataProviders';
import {
  GuildConfig,
  ReputationScore,
  LeaderboardEntry,
  DataProvider,
} from '../types';

const app = express();
app.use(cors());
app.use(express.json());

// ============================================
// IN-MEMORY STORAGE (Replace with DB in prod)
// ============================================

const guildConfigs: Map<string, GuildConfig> = new Map();
const scoreCache: Map<string, ReputationScore> = new Map();
const providers: Map<string, DataProvider> = new Map();

// Default calculator instance
const calculator = new GuildScoreCalculator();

// ============================================
// MIDDLEWARE
// ============================================

const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ============================================
// GUILD MANAGEMENT ENDPOINTS
// ============================================

/**
 * Register a new guild
 * POST /api/guilds
 */
app.post('/api/guilds', asyncHandler(async (req: Request, res: Response) => {
  const config: GuildConfig = req.body;
  
  if (!config.id || !config.name) {
    return res.status(400).json({ error: 'Guild id and name are required' });
  }

  guildConfigs.set(config.id, config);
  
  // Initialize provider (use mock for demo)
  providers.set(config.id, new MockDataProvider());

  res.status(201).json({
    message: 'Guild registered successfully',
    guild: config,
  });
}));

/**
 * Get guild configuration
 * GET /api/guilds/:guildId
 */
app.get('/api/guilds/:guildId', (req: Request, res: Response) => {
  const { guildId } = req.params;
  const config = guildConfigs.get(guildId);
  
  if (!config) {
    return res.status(404).json({ error: 'Guild not found' });
  }

  res.json(config);
});

/**
 * List all registered guilds
 * GET /api/guilds
 */
app.get('/api/guilds', (req: Request, res: Response) => {
  const guilds = Array.from(guildConfigs.values());
  res.json({ guilds, total: guilds.length });
});

// ============================================
// REPUTATION SCORE ENDPOINTS
// ============================================

/**
 * Get reputation score for an address
 * GET /api/guilds/:guildId/reputation/:address
 */
app.get('/api/guilds/:guildId/reputation/:address', asyncHandler(async (req: Request, res: Response) => {
  const { guildId, address } = req.params;
  const forceRefresh = req.query.refresh === 'true';

  // Check cache first
  const cacheKey = `${guildId}:${address.toLowerCase()}`;
  if (!forceRefresh && scoreCache.has(cacheKey)) {
    const cached = scoreCache.get(cacheKey)!;
    const cacheAge = Date.now() - cached.lastUpdated.getTime();
    
    // Cache valid for 5 minutes
    if (cacheAge < 5 * 60 * 1000) {
      return res.json({ score: cached, cached: true });
    }
  }

  // Get or create provider
  let provider = providers.get(guildId);
  if (!provider) {
    // Auto-create mock provider if guild doesn't exist yet
    provider = new MockDataProvider();
    providers.set(guildId, provider);
  }

  // Fetch all metrics
  const [gaming, governance, community, scholarship] = await Promise.all([
    provider.fetchGamingMetrics(address, guildId),
    provider.fetchGovernanceMetrics(address, guildId),
    provider.fetchCommunityMetrics(address, guildId),
    provider.fetchScholarshipMetrics(address, guildId),
  ]);

  // Calculate score
  const guildConfig = guildConfigs.get(guildId);
  const customCalculator = guildConfig?.customWeights 
    ? new GuildScoreCalculator(guildConfig.customWeights)
    : calculator;

  const score = customCalculator.calculateScore(
    gaming,
    governance,
    community,
    scholarship
  );

  // Cache result
  scoreCache.set(cacheKey, score);

  res.json({
    score,
    metrics: { gaming, governance, community, scholarship },
    cached: false,
  });
}));

/**
 * Batch fetch reputation scores
 * POST /api/guilds/:guildId/reputation/batch
 */
app.post('/api/guilds/:guildId/reputation/batch', asyncHandler(async (req: Request, res: Response) => {
  const { guildId } = req.params;
  const { addresses } = req.body;

  if (!Array.isArray(addresses) || addresses.length === 0) {
    return res.status(400).json({ error: 'addresses array is required' });
  }

  if (addresses.length > 100) {
    return res.status(400).json({ error: 'Maximum 100 addresses per batch' });
  }

  let provider = providers.get(guildId);
  if (!provider) {
    provider = new MockDataProvider();
    providers.set(guildId, provider);
  }

  const results = await Promise.all(
    addresses.map(async (address: string) => {
      const [gaming, governance, community, scholarship] = await Promise.all([
        provider!.fetchGamingMetrics(address, guildId),
        provider!.fetchGovernanceMetrics(address, guildId),
        provider!.fetchCommunityMetrics(address, guildId),
        provider!.fetchScholarshipMetrics(address, guildId),
      ]);

      return calculator.calculateScore(gaming, governance, community, scholarship);
    })
  );

  res.json({ scores: results });
}));

// ============================================
// LEADERBOARD ENDPOINTS
// ============================================

/**
 * Get guild leaderboard
 * GET /api/guilds/:guildId/leaderboard
 */
app.get('/api/guilds/:guildId/leaderboard', asyncHandler(async (req: Request, res: Response) => {
  const { guildId } = req.params;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const offset = parseInt(req.query.offset as string) || 0;
  const category = req.query.category as string;

  // Get all cached scores for this guild
  const guildScores: ReputationScore[] = [];
  
  for (const [key, score] of scoreCache.entries()) {
    if (key.startsWith(`${guildId}:`)) {
      guildScores.push(score);
    }
  }

  // Sort by total score (or category score)
  let sorted: ReputationScore[];
  if (category && ['gaming', 'governance', 'community', 'treasury', 'scholarship', 'mentorship'].includes(category)) {
    sorted = guildScores.sort((a, b) => 
      (b.breakdown as any)[category] - (a.breakdown as any)[category]
    );
  } else {
    sorted = guildScores.sort((a, b) => b.totalScore - a.totalScore);
  }

  // Apply pagination
  const paginated = sorted.slice(offset, offset + limit);

  // Transform to leaderboard entries
  const leaderboard: LeaderboardEntry[] = paginated.map((score, index) => ({
    rank: offset + index + 1,
    address: score.address,
    displayName: undefined, // Would come from ENS/profile service
    totalScore: score.totalScore,
    tier: score.tier,
    change24h: 0, // Would need historical data
    topBadge: score.badges[0],
  }));

  res.json({
    leaderboard,
    total: guildScores.length,
    limit,
    offset,
    category: category || 'total',
  });
}));

// ============================================
// BADGE ENDPOINTS
// ============================================

/**
 * Get all badges for an address
 * GET /api/guilds/:guildId/badges/:address
 */
app.get('/api/guilds/:guildId/badges/:address', asyncHandler(async (req: Request, res: Response) => {
  const { guildId, address } = req.params;
  const cacheKey = `${guildId}:${address.toLowerCase()}`;
  
  const score = scoreCache.get(cacheKey);
  if (!score) {
    return res.status(404).json({ 
      error: 'Score not found. Fetch reputation first.',
      hint: `GET /api/guilds/${guildId}/reputation/${address}`
    });
  }

  res.json({
    address,
    badges: score.badges,
    totalBadges: score.badges.length,
    byCategory: groupBadgesByCategory(score.badges),
  });
}));

/**
 * Get badge definitions
 * GET /api/badges
 */
app.get('/api/badges', (req: Request, res: Response) => {
  // Return all possible badges (static definitions)
  const badgeDefinitions = [
    { id: 'veteran-player', name: 'Veteran Player', category: 'gaming', rarity: 'rare', criteria: 'Play 1000+ matches' },
    { id: 'champion', name: 'Champion', category: 'gaming', rarity: 'epic', criteria: '70%+ win rate' },
    { id: 'dedicated', name: 'Dedicated', category: 'gaming', rarity: 'rare', criteria: '30 day play streak' },
    { id: 'whale-earner', name: 'Whale Earner', category: 'gaming', rarity: 'legendary', criteria: 'Earn 10,000+ tokens' },
    { id: 'active-voter', name: 'Active Voter', category: 'governance', rarity: 'rare', criteria: '90%+ voting participation' },
    { id: 'policy-maker', name: 'Policy Maker', category: 'governance', rarity: 'epic', criteria: '3+ proposals passed' },
    { id: 'trusted-delegate', name: 'Trusted Delegate', category: 'governance', rarity: 'epic', criteria: '10+ delegators' },
    { id: 'recruiter', name: 'Recruiter', category: 'community', rarity: 'rare', criteria: 'Refer 10+ active members' },
    { id: 'educator', name: 'Educator', category: 'community', rarity: 'rare', criteria: 'Create 5+ guides' },
    { id: 'scholarship-manager', name: 'Scholarship Manager', category: 'scholarship', rarity: 'rare', criteria: 'Manage 10+ scholars' },
    { id: 'mentor-master', name: 'Mentor Master', category: 'scholarship', rarity: 'epic', criteria: '5+ scholars graduated' },
    { id: 'retention-king', name: 'Retention King', category: 'scholarship', rarity: 'legendary', criteria: '90%+ scholar retention' },
  ];

  res.json({ badges: badgeDefinitions });
});

// ============================================
// ANALYTICS ENDPOINTS
// ============================================

/**
 * Get guild statistics
 * GET /api/guilds/:guildId/stats
 */
app.get('/api/guilds/:guildId/stats', (req: Request, res: Response) => {
  const { guildId } = req.params;
  
  // Aggregate stats from cached scores
  const guildScores: ReputationScore[] = [];
  for (const [key, score] of scoreCache.entries()) {
    if (key.startsWith(`${guildId}:`)) {
      guildScores.push(score);
    }
  }

  if (guildScores.length === 0) {
    return res.json({
      totalMembers: 0,
      averageScore: 0,
      tierDistribution: {},
      topCategories: [],
    });
  }

  const totalScore = guildScores.reduce((sum, s) => sum + s.totalScore, 0);
  const avgScore = totalScore / guildScores.length;

  // Tier distribution
  const tierDistribution: Record<string, number> = {};
  for (const score of guildScores) {
    tierDistribution[score.tier] = (tierDistribution[score.tier] || 0) + 1;
  }

  // Average category scores
  const categoryTotals: Record<string, number> = {
    gaming: 0,
    governance: 0,
    community: 0,
    treasury: 0,
    scholarship: 0,
    mentorship: 0,
  };
  
  for (const score of guildScores) {
    for (const [cat, val] of Object.entries(score.breakdown)) {
      categoryTotals[cat] += val;
    }
  }

  const topCategories = Object.entries(categoryTotals)
    .map(([category, total]) => ({
      category,
      averageScore: total / guildScores.length,
    }))
    .sort((a, b) => b.averageScore - a.averageScore);

  res.json({
    totalMembers: guildScores.length,
    averageScore: Math.round(avgScore * 100) / 100,
    tierDistribution,
    topCategories,
  });
});

// ============================================
// HEALTH & UTILITY ENDPOINTS
// ============================================

/**
 * Health check
 * GET /health
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    guildsRegistered: guildConfigs.size,
    scoresCalculated: scoreCache.size,
  });
});

/**
 * API documentation
 * GET /
 */
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'Guild Reputation Engine API',
    version: '1.0.0',
    description: 'On-chain reputation system for Gaming Guild DAOs',
    author: 'PineOT',
    endpoints: {
      guilds: {
        'POST /api/guilds': 'Register a new guild',
        'GET /api/guilds': 'List all guilds',
        'GET /api/guilds/:guildId': 'Get guild config',
        'GET /api/guilds/:guildId/stats': 'Get guild statistics',
      },
      reputation: {
        'GET /api/guilds/:guildId/reputation/:address': 'Get reputation score',
        'POST /api/guilds/:guildId/reputation/batch': 'Batch fetch scores',
      },
      leaderboard: {
        'GET /api/guilds/:guildId/leaderboard': 'Get leaderboard',
      },
      badges: {
        'GET /api/guilds/:guildId/badges/:address': 'Get user badges',
        'GET /api/badges': 'Get badge definitions',
      },
      health: {
        'GET /health': 'Health check',
      },
    },
  });
});

// ============================================
// ERROR HANDLING
// ============================================

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('API Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// ============================================
// HELPER FUNCTIONS
// ============================================

function groupBadgesByCategory(badges: any[]): Record<string, any[]> {
  const grouped: Record<string, any[]> = {};
  for (const badge of badges) {
    if (!grouped[badge.category]) {
      grouped[badge.category] = [];
    }
    grouped[badge.category].push(badge);
  }
  return grouped;
}

// ============================================
// EXPORT
// ============================================

export { app };

// Start server if run directly
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🎮 Guild Reputation Engine running on port ${PORT}`);
    console.log(`📊 API docs: http://localhost:${PORT}/`);
  });
}
