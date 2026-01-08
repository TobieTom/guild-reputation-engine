/**
 * Guild Reputation Score Calculator
 * Core scoring engine for Gaming Guild DAOs
 *
 * This is the heart of the system - calculates reputation scores
 * from various metrics using configurable weights.
 *
 * @author PineOT (Tobias)
 */

import {
  ReputationScore,
  ScoreBreakdown,
  ReputationTier,
  Badge,
  GamingMetrics,
  GovernanceMetrics,
  CommunityMetrics,
  ScholarshipMetrics,
  WeightConfig,
  DEFAULT_WEIGHTS,
  TIER_THRESHOLDS,
  ScoreProvider,
  BadgeCategory,
  BadgeRarity,
} from '../types';
import { getArbitrumData } from '../providers/ArbitrumProvider';
import { getSnapshotData } from '../providers/SnapshotProvider';

export class GuildScoreCalculator implements ScoreProvider {
  private weights: WeightConfig;

  constructor(customWeights?: Partial<WeightConfig>) {
    this.weights = this.mergeWeights(DEFAULT_WEIGHTS, customWeights);
  }

  /**
   * Main calculation method - produces final reputation score
   */
  calculateScore(
    gaming: GamingMetrics,
    governance: GovernanceMetrics,
    community: CommunityMetrics,
    scholarship: ScholarshipMetrics,
    weights?: WeightConfig
  ): ReputationScore {
    const w = weights || this.weights;

    // Calculate individual category scores
    const breakdown: ScoreBreakdown = {
      gaming: this.calculateGamingScore(gaming, w.gaming),
      governance: this.calculateGovernanceScore(governance, w.governance),
      community: this.calculateCommunityScore(community, w.community),
      treasury: this.calculateTreasuryScore(gaming, scholarship),
      scholarship: this.calculateScholarshipScore(scholarship, w.scholarship),
      mentorship: this.calculateMentorshipScore(community, scholarship),
    };

    // Sum total score
    const totalScore = Object.values(breakdown).reduce((sum, val) => sum + val, 0);

    // Determine tier
    const tier = this.determineTier(totalScore);

    // Calculate earned badges
    const badges = this.calculateBadges(gaming, governance, community, scholarship);

    return {
      address: gaming.address,
      totalScore: Math.round(totalScore * 100) / 100,
      breakdown,
      tier,
      badges,
      lastUpdated: new Date(),
      metadata: {
        guildId: gaming.guildId,
        memberId: gaming.address,
        joinDate: new Date(), // Would come from actual data
        totalGamesPlayed: gaming.totalMatchesPlayed,
        currentStreak: gaming.currentStreak,
        peakScore: totalScore, // Would track historical peak
      },
    };
  }

  /**
   * Gaming score calculation (P2E performance)
   */
  private calculateGamingScore(metrics: GamingMetrics, config: typeof DEFAULT_WEIGHTS.gaming): number {
    const { metrics: m } = config;
    
    let score = 0;

    // Matches played (diminishing returns after 1000)
    score += Math.min(metrics.totalMatchesPlayed * m.matchesPlayed, 500);

    // Win rate bonus (exponential for high performers)
    if (metrics.winRate > 0.5) {
      score += Math.pow((metrics.winRate - 0.5) * 100, 1.5) * m.winRate;
    }

    // Token earnings (normalized, capped)
    score += Math.min(metrics.totalTokensEarned * m.tokensEarned, 3000);

    // NFT value managed
    score += Math.min(metrics.nftValueManaged * m.nftValueManaged / 100, 2000);

    // Streak bonus (big bonus for consistency)
    score += metrics.currentStreak * m.streak;
    score += metrics.longestStreak * m.streak * 0.5; // Historical streak counts too

    // Active days multiplier
    const activityMultiplier = Math.min(metrics.activePlayDays / 30, 2); // Up to 2x
    score *= (1 + activityMultiplier * 0.1);

    return Math.min(Math.round(score), config.maxScore);
  }

  /**
   * Governance score calculation
   */
  private calculateGovernanceScore(metrics: GovernanceMetrics, config: typeof DEFAULT_WEIGHTS.governance): number {
    const { metrics: m } = config;
    
    let score = 0;

    // Voting participation (key metric)
    score += metrics.votingParticipationRate * 100 * m.votingParticipation;

    // Proposals created (high value)
    score += metrics.proposalsCreated * m.proposalsCreated;

    // Proposals passed (even higher value)
    score += metrics.proposalsPassed * m.proposalsPassed;

    // Forum activity
    score += (metrics.forumPostsCreated + metrics.forumReplies) * m.forumActivity;

    // Delegation (being trusted by others)
    score += metrics.delegatedVotingPower * m.delegatedPower;
    score += metrics.delegatorsCount * 50; // Each delegator is valuable

    return Math.min(Math.round(score), config.maxScore);
  }

  /**
   * Community score calculation
   */
  private calculateCommunityScore(metrics: CommunityMetrics, config: typeof DEFAULT_WEIGHTS.community): number {
    const { metrics: m } = config;
    
    let score = 0;

    // Discord activity (capped to prevent spam gaming)
    score += Math.min(metrics.discordMessagesCount * m.discordActivity, 200);

    // Helpful replies (quality over quantity)
    score += metrics.discordHelpfulReplies * m.helpfulReplies;

    // Events attendance
    score += metrics.discordEventsAttended * m.eventsAttended;

    // Content creation (very valuable)
    score += metrics.guidesCreated * m.guidesCreated;
    score += metrics.tutorialsShared * m.guidesCreated * 0.5;

    // Referrals (network growth)
    score += metrics.membersReferred * m.membersReferred;
    score += metrics.activeReferrals * m.membersReferred * 2; // Active referrals worth more

    return Math.min(Math.round(score), config.maxScore);
  }

  /**
   * Scholarship management score
   */
  private calculateScholarshipScore(metrics: ScholarshipMetrics, config: typeof DEFAULT_WEIGHTS.scholarship): number {
    const { metrics: m } = config;
    
    let score = 0;

    // Scholars managed
    score += metrics.scholarsManaged * m.scholarsManaged;
    score += metrics.activeScholars * m.scholarsManaged * 2;

    // Retention rate (quality indicator)
    score += metrics.scholarRetentionRate * m.scholarRetention;

    // NFTs lent
    score += metrics.nftsLentOut * m.nftsLent;

    // Training (mentorship)
    score += metrics.trainingSessionsHosted * m.trainingHosted;

    // Graduation (scholars becoming full members)
    score += metrics.graduatedScholars * m.scholarGraduation;

    return Math.min(Math.round(score), config.maxScore);
  }

  /**
   * Treasury contribution score
   */
  private calculateTreasuryScore(gaming: GamingMetrics, scholarship: ScholarshipMetrics): number {
    let score = 0;

    // Revenue generated for guild
    score += gaming.totalTokensEarned * 0.3; // Guild's share
    score += scholarship.lendingRevenue * 0.5;

    return Math.min(Math.round(score), 5000);
  }

  /**
   * Mentorship score (helping others)
   */
  private calculateMentorshipScore(community: CommunityMetrics, scholarship: ScholarshipMetrics): number {
    let score = 0;

    // Direct mentorship
    score += scholarship.trainingSessionsHosted * 20;
    score += scholarship.onboardingCompleted * 30;

    // Community help
    score += community.discordHelpfulReplies * 5;
    score += community.guidesCreated * 25;

    return Math.min(Math.round(score), 5000);
  }

  /**
   * Determine tier from total score
   */
  private determineTier(score: number): ReputationTier {
    const tiers: ReputationTier[] = ['grandmaster', 'master', 'diamond', 'platinum', 'gold', 'silver', 'bronze'];
    
    for (const tier of tiers) {
      if (score >= TIER_THRESHOLDS[tier]) {
        return tier;
      }
    }
    return 'bronze';
  }

  /**
   * Calculate earned badges based on achievements
   */
  private calculateBadges(
    gaming: GamingMetrics,
    governance: GovernanceMetrics,
    community: CommunityMetrics,
    scholarship: ScholarshipMetrics
  ): Badge[] {
    const badges: Badge[] = [];
    const now = new Date();

    // Gaming badges
    if (gaming.totalMatchesPlayed >= 1000) {
      badges.push(this.createBadge('veteran-player', 'Veteran Player', 'Played 1000+ matches', 'gaming', 'rare', now));
    }
    if (gaming.winRate >= 0.7) {
      badges.push(this.createBadge('champion', 'Champion', '70%+ win rate', 'gaming', 'epic', now));
    }
    if (gaming.currentStreak >= 30) {
      badges.push(this.createBadge('dedicated', 'Dedicated', '30 day play streak', 'gaming', 'rare', now));
    }
    if (gaming.totalTokensEarned >= 10000) {
      badges.push(this.createBadge('whale-earner', 'Whale Earner', 'Earned 10,000+ tokens', 'gaming', 'legendary', now));
    }

    // Governance badges
    if (governance.votingParticipationRate >= 0.9) {
      badges.push(this.createBadge('active-voter', 'Active Voter', '90%+ voting participation', 'governance', 'rare', now));
    }
    if (governance.proposalsPassed >= 3) {
      badges.push(this.createBadge('policy-maker', 'Policy Maker', '3+ proposals passed', 'governance', 'epic', now));
    }
    if (governance.delegatorsCount >= 10) {
      badges.push(this.createBadge('trusted-delegate', 'Trusted Delegate', '10+ delegators', 'governance', 'epic', now));
    }

    // Community badges
    if (community.membersReferred >= 10) {
      badges.push(this.createBadge('recruiter', 'Recruiter', 'Referred 10+ active members', 'community', 'rare', now));
    }
    if (community.guidesCreated >= 5) {
      badges.push(this.createBadge('educator', 'Educator', 'Created 5+ guides', 'community', 'rare', now));
    }
    if (community.discordEventsAttended >= 20) {
      badges.push(this.createBadge('social-butterfly', 'Social Butterfly', 'Attended 20+ events', 'community', 'uncommon', now));
    }

    // Scholarship badges
    if (scholarship.scholarsManaged >= 10) {
      badges.push(this.createBadge('scholarship-manager', 'Scholarship Manager', 'Managed 10+ scholars', 'scholarship', 'rare', now));
    }
    if (scholarship.graduatedScholars >= 5) {
      badges.push(this.createBadge('mentor-master', 'Mentor Master', '5+ scholars graduated', 'scholarship', 'epic', now));
    }
    if (scholarship.scholarRetentionRate >= 0.9) {
      badges.push(this.createBadge('retention-king', 'Retention King', '90%+ scholar retention', 'scholarship', 'legendary', now));
    }

    return badges;
  }

  /**
   * Helper to create badge objects
   */
  private createBadge(
    id: string,
    name: string,
    description: string,
    category: BadgeCategory,
    rarity: BadgeRarity,
    earnedAt: Date
  ): Badge {
    return {
      id,
      name,
      description,
      imageUri: `/badges/${id}.png`,
      category,
      rarity,
      earnedAt,
      criteria: {
        metric: id,
        threshold: 1,
        description,
      },
    };
  }

  /**
   * Merge custom weights with defaults
   */
  private mergeWeights(defaults: WeightConfig, custom?: Partial<WeightConfig>): WeightConfig {
    if (!custom) return defaults;

    return {
      gaming: { ...defaults.gaming, ...custom.gaming },
      governance: { ...defaults.governance, ...custom.governance },
      community: { ...defaults.community, ...custom.community },
      scholarship: { ...defaults.scholarship, ...custom.scholarship },
    };
  }

  /**
   * Apply time decay to historical scores
   */
  applyDecay(score: number, daysSinceActivity: number, decayRate: number): number {
    const decayFactor = Math.pow(1 - decayRate / 30, daysSinceActivity);
    return score * decayFactor;
  }

  /**
   * Get score change percentage
   */
  calculateChange(currentScore: number, previousScore: number): number {
    if (previousScore === 0) return 100;
    return ((currentScore - previousScore) / previousScore) * 100;
  }

  /**
   * Calculate reputation score using real on-chain and governance data
   * Fetches data from Arbitrum blockchain and Snapshot governance
   */
  async calculateRealScore(address: string, guildId?: string): Promise<{
    score: ReputationScore;
    dataSources: {
      arbitrum: any;
      snapshot: any;
    };
    breakdown: {
      governance: { source: string; calculation: string };
      treasury: { source: string; calculation: string };
      gaming: { source: string };
      community: { source: string };
      scholarship: { source: string };
    };
  }> {
    // Fetch real data from providers
    const [arbitrumData, snapshotData] = await Promise.all([
      getArbitrumData(address),
      getSnapshotData(address),
    ]);

    // Calculate governance score from real Snapshot data
    // Formula: (total votes * 10) + (unique spaces * 50)
    const governanceScore = Math.min(
      (snapshotData.totalVotes * 10) + (snapshotData.spacesVotedIn.length * 50),
      5000 // Max governance score
    );

    // Calculate treasury score from real Arbitrum data
    // For now, use raw token amounts (in production, convert to USD)
    const arbBalanceNum = parseFloat(arbitrumData.arbBalanceFormatted);
    const magicBalanceNum = parseFloat(arbitrumData.magicBalanceFormatted);
    const treasuryScore = Math.min(
      (arbBalanceNum * 10) + (magicBalanceNum * 5), // Weight ARB higher than MAGIC
      5000 // Max treasury score
    );

    // Use mock data for gaming, community, and scholarship (until those providers are built)
    const mockGamingScore = 500;
    const mockCommunityScore = 300;
    const mockScholarshipScore = 200;

    // Build score breakdown
    const breakdown: ScoreBreakdown = {
      governance: Math.round(governanceScore),
      treasury: Math.round(treasuryScore),
      gaming: mockGamingScore,
      community: mockCommunityScore,
      scholarship: mockScholarshipScore,
      mentorship: 100, // Mock
    };

    const totalScore = Object.values(breakdown).reduce((sum, val) => sum + val, 0);
    const tier = this.determineTier(totalScore);

    // Calculate badges from real data
    const badges: Badge[] = [];
    const now = new Date();

    // Governance badges from Snapshot data
    if (snapshotData.totalVotes >= 50) {
      badges.push(this.createBadge(
        'active-voter',
        'Active Voter',
        `Cast ${snapshotData.totalVotes} votes on Snapshot`,
        'governance',
        'rare',
        now
      ));
    }
    if (snapshotData.spacesVotedIn.length >= 5) {
      badges.push(this.createBadge(
        'multi-dao-participant',
        'Multi-DAO Participant',
        `Voted in ${snapshotData.spacesVotedIn.length} different DAOs`,
        'governance',
        'epic',
        now
      ));
    }

    // Treasury badges from Arbitrum data
    if (arbBalanceNum >= 100) {
      badges.push(this.createBadge(
        'arb-holder',
        'ARB Holder',
        `Holds ${arbBalanceNum.toFixed(2)} ARB tokens`,
        'governance',
        'uncommon',
        now
      ));
    }
    if (arbitrumData.transactionCount >= 100) {
      badges.push(this.createBadge(
        'arbitrum-veteran',
        'Arbitrum Veteran',
        `${arbitrumData.transactionCount} transactions on Arbitrum`,
        'community',
        'rare',
        now
      ));
    }

    const score: ReputationScore = {
      address,
      totalScore: Math.round(totalScore * 100) / 100,
      breakdown,
      tier,
      badges,
      lastUpdated: new Date(),
      metadata: {
        guildId: guildId || 'default',
        memberId: address,
        joinDate: new Date(),
        totalGamesPlayed: 0, // Mock
        currentStreak: 0, // Mock
        peakScore: totalScore,
      },
    };

    return {
      score,
      dataSources: {
        arbitrum: arbitrumData,
        snapshot: snapshotData,
      },
      breakdown: {
        governance: {
          source: 'Snapshot GraphQL API',
          calculation: `(${snapshotData.totalVotes} votes * 10) + (${snapshotData.spacesVotedIn.length} spaces * 50) = ${governanceScore}`,
        },
        treasury: {
          source: 'Arbitrum One RPC',
          calculation: `(${arbBalanceNum.toFixed(2)} ARB * 10) + (${magicBalanceNum.toFixed(2)} MAGIC * 5) = ${treasuryScore.toFixed(2)}`,
        },
        gaming: { source: 'Mock data (placeholder)' },
        community: { source: 'Mock data (placeholder)' },
        scholarship: { source: 'Mock data (placeholder)' },
      },
    };
  }
}

// Export singleton for convenience
export const defaultCalculator = new GuildScoreCalculator();
