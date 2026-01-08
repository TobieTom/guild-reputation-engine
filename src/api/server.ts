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
import { getArbitrumData } from '../providers/ArbitrumProvider';
import { getSnapshotData } from '../providers/SnapshotProvider';
import {
  GuildConfig,
  ReputationScore,
  LeaderboardEntry,
  DataProvider,
} from '../types';

// Configuration from environment variables
const PORT = parseInt(process.env.PORT || '3000', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10);

const app = express();

// CORS configuration
app.use(cors({
  origin: CORS_ORIGIN,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10kb' })); // Limit request body size

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

const rateLimit = (req: Request, res: Response, next: NextFunction) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  const clientData = rateLimitMap.get(clientIp);

  if (!clientData || now > clientData.resetTime) {
    rateLimitMap.set(clientIp, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  if (clientData.count >= RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({
      error: 'Too many requests',
      retryAfter: Math.ceil((clientData.resetTime - now) / 1000),
    });
  }

  clientData.count++;
  next();
};

// Apply rate limiting to all routes
app.use(rateLimit);

// Security headers
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// In-memory storage (replace with database in production)
const guildConfigs: Map<string, GuildConfig> = new Map();
const scoreCache: Map<string, ReputationScore> = new Map();
const providers: Map<string, DataProvider> = new Map();

// Default calculator instance
const calculator = new GuildScoreCalculator();

// Async handler wrapper
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void | Response>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

// Input validation helpers
function isValidAddress(address: string): boolean {
  return typeof address === 'string' && /^0x[a-fA-F0-9]{40}$/.test(address.trim());
}

function isValidGuildId(guildId: string): boolean {
  return typeof guildId === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(guildId.trim());
}

function sanitizeString(str: string): string {
  return str.replace(/[<>]/g, '').substring(0, 200);
}

// Guild Management Endpoints

/**
 * Register a new guild
 * POST /api/guilds
 */
app.post('/api/guilds', asyncHandler(async (req: Request, res: Response) => {
  const config: GuildConfig = req.body;

  if (!config.id || !config.name) {
    res.status(400).json({ error: 'Guild id and name are required' });
    return;
  }

  if (!isValidGuildId(config.id)) {
    res.status(400).json({ error: 'Invalid guild ID format' });
    return;
  }

  config.name = sanitizeString(config.name);

  guildConfigs.set(config.id, config);
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

  if (!isValidGuildId(guildId)) {
    res.status(400).json({ error: 'Invalid guild ID format' });
    return;
  }

  const config = guildConfigs.get(guildId);

  if (!config) {
    res.status(404).json({ error: 'Guild not found' });
    return;
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

// Reputation Score Endpoints

/**
 * Get reputation score for an address
 * GET /api/guilds/:guildId/reputation/:address
 */
app.get('/api/guilds/:guildId/reputation/:address', asyncHandler(async (req: Request, res: Response) => {
  const { guildId, address } = req.params;
  const forceRefresh = req.query.refresh === 'true';

  if (!isValidGuildId(guildId)) {
    res.status(400).json({ error: 'Invalid guild ID format' });
    return;
  }

  if (!isValidAddress(address)) {
    res.status(400).json({ error: 'Invalid wallet address format' });
    return;
  }

  const normalizedAddress = address.toLowerCase();
  const cacheKey = `${guildId}:${normalizedAddress}`;

  if (!forceRefresh && scoreCache.has(cacheKey)) {
    const cached = scoreCache.get(cacheKey)!;
    const cacheAge = Date.now() - cached.lastUpdated.getTime();

    // Cache valid for 5 minutes
    if (cacheAge < 5 * 60 * 1000) {
      res.json({ score: cached, cached: true });
      return;
    }
  }

  let provider = providers.get(guildId);
  if (!provider) {
    provider = new MockDataProvider();
    providers.set(guildId, provider);
  }

  const [gaming, governance, community, scholarship] = await Promise.all([
    provider.fetchGamingMetrics(normalizedAddress, guildId),
    provider.fetchGovernanceMetrics(normalizedAddress, guildId),
    provider.fetchCommunityMetrics(normalizedAddress, guildId),
    provider.fetchScholarshipMetrics(normalizedAddress, guildId),
  ]);

  const guildConfig = guildConfigs.get(guildId);
  const customCalculator = guildConfig?.customWeights
    ? new GuildScoreCalculator(guildConfig.customWeights)
    : calculator;

  const score = customCalculator.calculateScore(gaming, governance, community, scholarship);
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

  if (!isValidGuildId(guildId)) {
    res.status(400).json({ error: 'Invalid guild ID format' });
    return;
  }

  if (!Array.isArray(addresses) || addresses.length === 0) {
    res.status(400).json({ error: 'addresses array is required' });
    return;
  }

  if (addresses.length > 100) {
    res.status(400).json({ error: 'Maximum 100 addresses per batch' });
    return;
  }

  // Validate all addresses
  const invalidAddresses = addresses.filter((addr: unknown) => !isValidAddress(addr as string));
  if (invalidAddresses.length > 0) {
    res.status(400).json({ error: 'Invalid address format in batch' });
    return;
  }

  let provider = providers.get(guildId);
  if (!provider) {
    provider = new MockDataProvider();
    providers.set(guildId, provider);
  }

  const results = await Promise.all(
    addresses.map(async (address: string) => {
      const normalizedAddress = address.toLowerCase();
      const [gaming, governance, community, scholarship] = await Promise.all([
        provider!.fetchGamingMetrics(normalizedAddress, guildId),
        provider!.fetchGovernanceMetrics(normalizedAddress, guildId),
        provider!.fetchCommunityMetrics(normalizedAddress, guildId),
        provider!.fetchScholarshipMetrics(normalizedAddress, guildId),
      ]);

      return calculator.calculateScore(gaming, governance, community, scholarship);
    })
  );

  res.json({ scores: results });
}));

// Leaderboard Endpoints

/**
 * Get guild leaderboard
 * GET /api/guilds/:guildId/leaderboard
 */
app.get('/api/guilds/:guildId/leaderboard', asyncHandler(async (req: Request, res: Response) => {
  const { guildId } = req.params;

  if (!isValidGuildId(guildId)) {
    res.status(400).json({ error: 'Invalid guild ID format' });
    return;
  }

  const limitParam = parseInt(req.query.limit as string, 10);
  const offsetParam = parseInt(req.query.offset as string, 10);
  const limit = Math.min(isNaN(limitParam) ? 50 : limitParam, 100);
  const offset = isNaN(offsetParam) ? 0 : Math.max(0, offsetParam);
  const category = req.query.category as string;

  const guildScores: ReputationScore[] = [];

  for (const [key, score] of scoreCache.entries()) {
    if (key.startsWith(`${guildId}:`)) {
      guildScores.push(score);
    }
  }

  const validCategories = ['gaming', 'governance', 'community', 'treasury', 'scholarship', 'mentorship'];
  let sorted: ReputationScore[];

  if (category && validCategories.includes(category)) {
    sorted = guildScores.sort((a, b) =>
      (b.breakdown as unknown as Record<string, number>)[category] - (a.breakdown as unknown as Record<string, number>)[category]
    );
  } else {
    sorted = guildScores.sort((a, b) => b.totalScore - a.totalScore);
  }

  const paginated = sorted.slice(offset, offset + limit);

  const leaderboard: LeaderboardEntry[] = paginated.map((score, index) => ({
    rank: offset + index + 1,
    address: score.address,
    displayName: undefined,
    totalScore: score.totalScore,
    tier: score.tier,
    change24h: 0,
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

// Badge Endpoints

/**
 * Get all badges for an address
 * GET /api/guilds/:guildId/badges/:address
 */
app.get('/api/guilds/:guildId/badges/:address', asyncHandler(async (req: Request, res: Response) => {
  const { guildId, address } = req.params;

  if (!isValidGuildId(guildId)) {
    res.status(400).json({ error: 'Invalid guild ID format' });
    return;
  }

  if (!isValidAddress(address)) {
    res.status(400).json({ error: 'Invalid wallet address format' });
    return;
  }

  const cacheKey = `${guildId}:${address.toLowerCase()}`;
  const score = scoreCache.get(cacheKey);

  if (!score) {
    res.status(404).json({
      error: 'Score not found. Fetch reputation first.',
      hint: `GET /api/guilds/${guildId}/reputation/${address}`,
    });
    return;
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

// Analytics Endpoints

/**
 * Get guild statistics
 * GET /api/guilds/:guildId/stats
 */
app.get('/api/guilds/:guildId/stats', (req: Request, res: Response) => {
  const { guildId } = req.params;

  if (!isValidGuildId(guildId)) {
    res.status(400).json({ error: 'Invalid guild ID format' });
    return;
  }

  const guildScores: ReputationScore[] = [];
  for (const [key, score] of scoreCache.entries()) {
    if (key.startsWith(`${guildId}:`)) {
      guildScores.push(score);
    }
  }

  if (guildScores.length === 0) {
    res.json({
      totalMembers: 0,
      averageScore: 0,
      tierDistribution: {},
      topCategories: [],
    });
    return;
  }

  const totalScore = guildScores.reduce((sum, s) => sum + s.totalScore, 0);
  const avgScore = totalScore / guildScores.length;

  const tierDistribution: Record<string, number> = {};
  for (const score of guildScores) {
    tierDistribution[score.tier] = (tierDistribution[score.tier] || 0) + 1;
  }

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

// Test Endpoints

/**
 * Test Arbitrum blockchain data fetching
 * GET /api/test/arbitrum/:address
 */
app.get('/api/test/arbitrum/:address', asyncHandler(async (req: Request, res: Response) => {
  const { address } = req.params;

  if (!isValidAddress(address)) {
    res.status(400).json({ success: false, error: 'Invalid wallet address format' });
    return;
  }

  try {
    const data = await getArbitrumData(address);
    res.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch Arbitrum data';
    res.status(400).json({ success: false, error: message });
  }
}));

/**
 * Test Snapshot governance data fetching
 * GET /api/test/snapshot/:address
 */
app.get('/api/test/snapshot/:address', asyncHandler(async (req: Request, res: Response) => {
  const { address } = req.params;

  if (!isValidAddress(address)) {
    res.status(400).json({ success: false, error: 'Invalid wallet address format' });
    return;
  }

  try {
    const data = await getSnapshotData(address);
    res.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch Snapshot data';
    res.status(400).json({ success: false, error: message });
  }
}));

/**
 * Calculate real reputation score from on-chain and governance data
 * GET /api/reputation/real/:address
 */
app.get('/api/reputation/real/:address', asyncHandler(async (req: Request, res: Response) => {
  const { address } = req.params;
  const { guildId } = req.query;

  if (!isValidAddress(address)) {
    res.status(400).json({ success: false, error: 'Invalid wallet address format' });
    return;
  }

  if (guildId && !isValidGuildId(guildId as string)) {
    res.status(400).json({ success: false, error: 'Invalid guild ID format' });
    return;
  }

  try {
    const result = await calculator.calculateRealScore(address, guildId as string);
    res.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to calculate reputation score';
    res.status(400).json({ success: false, error: message });
  }
}));

// Health and Utility Endpoints

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
        'GET /api/reputation/real/:address': 'Get real on-chain reputation',
      },
      leaderboard: {
        'GET /api/guilds/:guildId/leaderboard': 'Get leaderboard',
      },
      badges: {
        'GET /api/guilds/:guildId/badges/:address': 'Get user badges',
        'GET /api/badges': 'Get badge definitions',
      },
      test: {
        'GET /api/test/arbitrum/:address': 'Test Arbitrum data fetch',
        'GET /api/test/snapshot/:address': 'Test Snapshot data fetch',
      },
      health: {
        'GET /health': 'Health check',
      },
    },
  });
});

// Error Handling
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  // Log error in development only
  if (NODE_ENV === 'development') {
    process.stderr.write(`API Error: ${err.message}\n${err.stack}\n`);
  }

  res.status(500).json({
    error: 'Internal server error',
    message: NODE_ENV === 'development' ? err.message : undefined,
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Helper Functions
function groupBadgesByCategory(badges: Array<{ category: string }>): Record<string, unknown[]> {
  const grouped: Record<string, unknown[]> = {};
  for (const badge of badges) {
    if (!grouped[badge.category]) {
      grouped[badge.category] = [];
    }
    grouped[badge.category].push(badge);
  }
  return grouped;
}

// Export for testing
export { app };

// Start server if run directly
if (require.main === module) {
  app.listen(PORT, () => {
    process.stdout.write(`Guild Reputation Engine running on port ${PORT}\n`);
    process.stdout.write(`API docs: http://localhost:${PORT}/\n`);
  });
}
