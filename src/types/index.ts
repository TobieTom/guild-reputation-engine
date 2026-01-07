/**
 * Guild Reputation Engine - Type Definitions
 * Built for Gaming Guild DAOs (YGG, Merit Circle, Avocado, etc.)
 * 
 * @author PineOT (Tobias)
 * @version 1.0.0
 */

// ============================================
// CORE REPUTATION TYPES
// ============================================

export interface ReputationScore {
  address: string;
  totalScore: number;
  breakdown: ScoreBreakdown;
  tier: ReputationTier;
  badges: Badge[];
  lastUpdated: Date;
  metadata: ReputationMetadata;
}

export interface ScoreBreakdown {
  gaming: number;         // In-game performance
  governance: number;     // Voting participation
  community: number;      // Discord/forum activity
  treasury: number;       // Financial contributions
  scholarship: number;    // Scholar management (for managers)
  mentorship: number;     // Helping new members
}

export interface ReputationMetadata {
  guildId: string;
  memberId: string;
  joinDate: Date;
  totalGamesPlayed: number;
  currentStreak: number;
  peakScore: number;
}

// ============================================
// TIER SYSTEM (Gamified Progression)
// ============================================

export type ReputationTier = 
  | 'bronze'    // 0-999
  | 'silver'    // 1000-2499
  | 'gold'      // 2500-4999
  | 'platinum'  // 5000-9999
  | 'diamond'   // 10000-24999
  | 'master'    // 25000-49999
  | 'grandmaster'; // 50000+

export const TIER_THRESHOLDS: Record<ReputationTier, number> = {
  bronze: 0,
  silver: 1000,
  gold: 2500,
  platinum: 5000,
  diamond: 10000,
  master: 25000,
  grandmaster: 50000,
};

// ============================================
// BADGE SYSTEM (Soulbound-style achievements)
// ============================================

export interface Badge {
  id: string;
  name: string;
  description: string;
  imageUri: string;
  category: BadgeCategory;
  rarity: BadgeRarity;
  earnedAt: Date;
  criteria: BadgeCriteria;
}

export type BadgeCategory = 
  | 'gaming'
  | 'governance'
  | 'community'
  | 'scholarship'
  | 'special';

export type BadgeRarity = 
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'epic'
  | 'legendary';

export interface BadgeCriteria {
  metric: string;
  threshold: number;
  description: string;
}

// ============================================
// GAMING METRICS (P2E Specific)
// ============================================

export interface GamingMetrics {
  address: string;
  guildId: string;
  
  // Core gaming stats
  totalMatchesPlayed: number;
  matchesWon: number;
  winRate: number;
  
  // Earnings (P2E)
  totalTokensEarned: number;
  tokensThisMonth: number;
  earningsRank: number;
  
  // NFT activity
  nftsRented: number;
  nftsOwned: number;
  nftValueManaged: number; // USD equivalent
  
  // Time-based
  activePlayDays: number;
  averageSessionHours: number;
  currentStreak: number;
  longestStreak: number;
  
  // Game-specific (expandable)
  gameSpecificStats: Record<string, any>;
}

// ============================================
// GOVERNANCE METRICS
// ============================================

export interface GovernanceMetrics {
  address: string;
  guildId: string;
  
  // Voting
  proposalsVotedOn: number;
  totalProposals: number;
  votingParticipationRate: number;
  
  // Proposals
  proposalsCreated: number;
  proposalsPassed: number;
  proposalSuccessRate: number;
  
  // Delegation
  delegatedVotingPower: number;
  delegatorsCount: number;
  
  // Forum
  forumPostsCreated: number;
  forumReplies: number;
  forumReactionsReceived: number;
}

// ============================================
// COMMUNITY METRICS
// ============================================

export interface CommunityMetrics {
  address: string;
  guildId: string;
  
  // Discord
  discordMessagesCount: number;
  discordHelpfulReplies: number;
  discordEventsAttended: number;
  discordRolesCount: number;
  
  // Content creation
  guidesCreated: number;
  tutorialsShared: number;
  contentEngagement: number;
  
  // Referrals
  membersReferred: number;
  activeReferrals: number;
  
  // Moderation
  reportsSubmitted: number;
  moderationActions: number;
}

// ============================================
// SCHOLARSHIP METRICS (For managers/lenders)
// ============================================

export interface ScholarshipMetrics {
  address: string;
  guildId: string;
  
  // Scholar management
  scholarsManaged: number;
  activeScholars: number;
  graduatedScholars: number; // Became full members
  
  // Performance
  scholarRetentionRate: number;
  averageScholarEarnings: number;
  scholarSatisfactionScore: number;
  
  // NFT lending
  nftsLentOut: number;
  lendingRevenue: number;
  
  // Training
  trainingSessionsHosted: number;
  onboardingCompleted: number;
}

// ============================================
// WEIGHT CONFIGURATION
// ============================================

export interface WeightConfig {
  gaming: CategoryWeights;
  governance: CategoryWeights;
  community: CategoryWeights;
  scholarship: CategoryWeights;
}

export interface CategoryWeights {
  baseWeight: number;
  metrics: Record<string, number>;
  decayRate: number; // How fast old contributions decay (0-1)
  maxScore: number;
}

export const DEFAULT_WEIGHTS: WeightConfig = {
  gaming: {
    baseWeight: 30,
    metrics: {
      matchesPlayed: 0.5,
      winRate: 2,
      tokensEarned: 1.5,
      nftValueManaged: 1,
      streak: 3,
    },
    decayRate: 0.1, // 10% decay per month
    maxScore: 15000,
  },
  governance: {
    baseWeight: 25,
    metrics: {
      votingParticipation: 3,
      proposalsCreated: 10,
      proposalsPassed: 15,
      forumActivity: 1,
      delegatedPower: 0.001,
    },
    decayRate: 0.05,
    maxScore: 12500,
  },
  community: {
    baseWeight: 25,
    metrics: {
      discordActivity: 0.1,
      helpfulReplies: 2,
      eventsAttended: 5,
      guidesCreated: 20,
      membersReferred: 10,
    },
    decayRate: 0.15,
    maxScore: 12500,
  },
  scholarship: {
    baseWeight: 20,
    metrics: {
      scholarsManaged: 5,
      scholarRetention: 50,
      nftsLent: 2,
      trainingHosted: 15,
      scholarGraduation: 25,
    },
    decayRate: 0.08,
    maxScore: 10000,
  },
};

// ============================================
// API TYPES
// ============================================

export interface GuildConfig {
  id: string;
  name: string;
  chain: 'ethereum' | 'polygon' | 'arbitrum' | 'solana' | 'base';
  contractAddress?: string;
  snapshotSpace?: string;
  discordServerId?: string;
  customWeights?: Partial<WeightConfig>;
  games: GameConfig[];
}

export interface GameConfig {
  id: string;
  name: string;
  contractAddress?: string;
  metricsEndpoint?: string;
  tokenSymbol: string;
}

export interface LeaderboardEntry {
  rank: number;
  address: string;
  displayName?: string;
  totalScore: number;
  tier: ReputationTier;
  change24h: number;
  topBadge?: Badge;
}

export interface ReputationHistoryEntry {
  timestamp: Date;
  score: number;
  breakdown: ScoreBreakdown;
  event?: string;
}

// ============================================
// PROVIDER INTERFACES
// ============================================

export interface DataProvider {
  name: string;
  fetchGamingMetrics(address: string, guildId: string): Promise<GamingMetrics>;
  fetchGovernanceMetrics(address: string, guildId: string): Promise<GovernanceMetrics>;
  fetchCommunityMetrics(address: string, guildId: string): Promise<CommunityMetrics>;
  fetchScholarshipMetrics(address: string, guildId: string): Promise<ScholarshipMetrics>;
}

export interface ScoreProvider {
  calculateScore(
    gaming: GamingMetrics,
    governance: GovernanceMetrics,
    community: CommunityMetrics,
    scholarship: ScholarshipMetrics,
    weights: WeightConfig
  ): ReputationScore;
}
