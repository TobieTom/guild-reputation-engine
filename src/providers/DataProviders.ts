/**
 * Data Providers for Guild Reputation Engine
 * 
 * These providers fetch data from various sources:
 * - On-chain data (via RPC/subgraphs)
 * - Snapshot (governance)
 * - Discord (community)
 * - Custom game APIs
 * 
 * @author PineOT (Tobias)
 */

import axios from 'axios';
import { ethers } from 'ethers';
import {
  DataProvider,
  GamingMetrics,
  GovernanceMetrics,
  CommunityMetrics,
  ScholarshipMetrics,
  GuildConfig,
} from '../types';

// ============================================
// SNAPSHOT PROVIDER (Governance Data)
// ============================================

export class SnapshotProvider {
  private baseUrl = 'https://hub.snapshot.org/graphql';

  async fetchVotingHistory(address: string, space: string): Promise<{
    votes: number;
    proposals: number;
    proposalsCreated: number;
  }> {
    const query = `
      query {
        votes(
          first: 1000,
          where: { voter: "${address.toLowerCase()}", space: "${space}" }
        ) {
          id
          proposal {
            id
          }
        }
        proposals(
          first: 100,
          where: { space: "${space}" }
        ) {
          id
          author
          state
        }
      }
    `;

    try {
      const response = await axios.post(this.baseUrl, { query });
      const data = response.data.data;

      const votesCount = data.votes?.length || 0;
      const totalProposals = data.proposals?.length || 0;
      const userProposals = data.proposals?.filter(
        (p: any) => p.author.toLowerCase() === address.toLowerCase()
      ) || [];

      return {
        votes: votesCount,
        proposals: totalProposals,
        proposalsCreated: userProposals.length,
      };
    } catch (error) {
      console.error('Snapshot fetch error:', error);
      return { votes: 0, proposals: 0, proposalsCreated: 0 };
    }
  }

  async fetchDelegationInfo(address: string, space: string): Promise<{
    delegatedPower: number;
    delegators: string[];
  }> {
    const query = `
      query {
        delegations(
          first: 100,
          where: { delegate: "${address.toLowerCase()}", space: "${space}" }
        ) {
          delegator
          space
        }
      }
    `;

    try {
      const response = await axios.post(this.baseUrl, { query });
      const delegations = response.data.data.delegations || [];

      return {
        delegatedPower: delegations.length * 1000, // Simplified
        delegators: delegations.map((d: any) => d.delegator),
      };
    } catch (error) {
      console.error('Delegation fetch error:', error);
      return { delegatedPower: 0, delegators: [] };
    }
  }
}

// ============================================
// ON-CHAIN PROVIDER (EVM Compatible)
// ============================================

export class OnChainProvider {
  private provider: ethers.JsonRpcProvider;

  constructor(rpcUrl: string) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
  }

  async fetchTokenBalance(address: string, tokenAddress: string): Promise<number> {
    const erc20Abi = ['function balanceOf(address) view returns (uint256)'];
    const contract = new ethers.Contract(tokenAddress, erc20Abi, this.provider);
    
    try {
      const balance = await contract.balanceOf(address);
      return Number(ethers.formatEther(balance));
    } catch (error) {
      console.error('Token balance fetch error:', error);
      return 0;
    }
  }

  async fetchNFTCount(address: string, nftAddress: string): Promise<number> {
    const erc721Abi = ['function balanceOf(address) view returns (uint256)'];
    const contract = new ethers.Contract(nftAddress, erc721Abi, this.provider);
    
    try {
      const balance = await contract.balanceOf(address);
      return Number(balance);
    } catch (error) {
      console.error('NFT count fetch error:', error);
      return 0;
    }
  }

  async fetchTransactionCount(address: string): Promise<number> {
    try {
      return await this.provider.getTransactionCount(address);
    } catch (error) {
      console.error('Transaction count fetch error:', error);
      return 0;
    }
  }
}

// ============================================
// DISCORD PROVIDER (via bot API)
// ============================================

export class DiscordProvider {
  private botToken: string;
  private baseUrl = 'https://discord.com/api/v10';

  constructor(botToken: string) {
    this.botToken = botToken;
  }

  // Note: This requires a Discord bot with proper permissions
  // In production, you'd use a database to cache Discord activity
  async fetchUserActivity(userId: string, serverId: string): Promise<{
    messages: number;
    reactions: number;
    voiceMinutes: number;
  }> {
    // Discord doesn't provide historical message counts via API
    // This would typically come from a bot that tracks activity
    // Returning mock structure for now
    return {
      messages: 0,
      reactions: 0,
      voiceMinutes: 0,
    };
  }

  async fetchUserRoles(userId: string, serverId: string): Promise<string[]> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/guilds/${serverId}/members/${userId}`,
        {
          headers: { Authorization: `Bot ${this.botToken}` },
        }
      );
      return response.data.roles || [];
    } catch (error) {
      console.error('Discord roles fetch error:', error);
      return [];
    }
  }
}

// ============================================
// GAME API PROVIDER (Generic Template)
// ============================================

export class GameApiProvider {
  private apiUrl: string;
  private apiKey?: string;

  constructor(apiUrl: string, apiKey?: string) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
  }

  async fetchPlayerStats(playerId: string): Promise<{
    matches: number;
    wins: number;
    tokensEarned: number;
    nftsOwned: number;
  }> {
    try {
      const headers: Record<string, string> = {};
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await axios.get(`${this.apiUrl}/players/${playerId}/stats`, { headers });
      return response.data;
    } catch (error) {
      console.error('Game API fetch error:', error);
      return { matches: 0, wins: 0, tokensEarned: 0, nftsOwned: 0 };
    }
  }
}

// ============================================
// AGGREGATED DATA PROVIDER
// ============================================

export class AggregatedDataProvider implements DataProvider {
  name = 'AggregatedProvider';
  
  private snapshotProvider: SnapshotProvider;
  private onChainProvider?: OnChainProvider;
  private discordProvider?: DiscordProvider;
  private gameProviders: Map<string, GameApiProvider> = new Map();
  private guildConfig: GuildConfig;

  constructor(config: GuildConfig, options?: {
    rpcUrl?: string;
    discordBotToken?: string;
  }) {
    this.guildConfig = config;
    this.snapshotProvider = new SnapshotProvider();
    
    if (options?.rpcUrl) {
      this.onChainProvider = new OnChainProvider(options.rpcUrl);
    }
    
    if (options?.discordBotToken) {
      this.discordProvider = new DiscordProvider(options.discordBotToken);
    }

    // Initialize game providers
    for (const game of config.games) {
      if (game.metricsEndpoint) {
        this.gameProviders.set(game.id, new GameApiProvider(game.metricsEndpoint));
      }
    }
  }

  async fetchGamingMetrics(address: string, guildId: string): Promise<GamingMetrics> {
    // Aggregate from all game providers
    let totalMatches = 0;
    let totalWins = 0;
    let totalTokens = 0;
    let totalNfts = 0;

    for (const [gameId, provider] of this.gameProviders) {
      const stats = await provider.fetchPlayerStats(address);
      totalMatches += stats.matches;
      totalWins += stats.wins;
      totalTokens += stats.tokensEarned;
      totalNfts += stats.nftsOwned;
    }

    // On-chain NFT data if available
    if (this.onChainProvider && this.guildConfig.contractAddress) {
      const onChainNfts = await this.onChainProvider.fetchNFTCount(
        address,
        this.guildConfig.contractAddress
      );
      totalNfts += onChainNfts;
    }

    return {
      address,
      guildId,
      totalMatchesPlayed: totalMatches,
      matchesWon: totalWins,
      winRate: totalMatches > 0 ? totalWins / totalMatches : 0,
      totalTokensEarned: totalTokens,
      tokensThisMonth: totalTokens * 0.1, // Would need historical data
      earningsRank: 0, // Would need leaderboard data
      nftsRented: 0,
      nftsOwned: totalNfts,
      nftValueManaged: totalNfts * 100, // Simplified valuation
      activePlayDays: 30, // Would need historical data
      averageSessionHours: 2,
      currentStreak: 7,
      longestStreak: 30,
      gameSpecificStats: {},
    };
  }

  async fetchGovernanceMetrics(address: string, guildId: string): Promise<GovernanceMetrics> {
    const space = this.guildConfig.snapshotSpace || guildId;
    
    const votingHistory = await this.snapshotProvider.fetchVotingHistory(address, space);
    const delegationInfo = await this.snapshotProvider.fetchDelegationInfo(address, space);

    const participationRate = votingHistory.proposals > 0 
      ? votingHistory.votes / votingHistory.proposals 
      : 0;

    return {
      address,
      guildId,
      proposalsVotedOn: votingHistory.votes,
      totalProposals: votingHistory.proposals,
      votingParticipationRate: Math.min(participationRate, 1),
      proposalsCreated: votingHistory.proposalsCreated,
      proposalsPassed: Math.floor(votingHistory.proposalsCreated * 0.6), // Would need actual data
      proposalSuccessRate: 0.6,
      delegatedVotingPower: delegationInfo.delegatedPower,
      delegatorsCount: delegationInfo.delegators.length,
      forumPostsCreated: 0, // Would need forum API
      forumReplies: 0,
      forumReactionsReceived: 0,
    };
  }

  async fetchCommunityMetrics(address: string, guildId: string): Promise<CommunityMetrics> {
    // Discord metrics would come from bot tracking
    // For now, return structure with defaults
    return {
      address,
      guildId,
      discordMessagesCount: 0,
      discordHelpfulReplies: 0,
      discordEventsAttended: 0,
      discordRolesCount: 0,
      guidesCreated: 0,
      tutorialsShared: 0,
      contentEngagement: 0,
      membersReferred: 0,
      activeReferrals: 0,
      reportsSubmitted: 0,
      moderationActions: 0,
    };
  }

  async fetchScholarshipMetrics(address: string, guildId: string): Promise<ScholarshipMetrics> {
    // Would come from guild's scholarship tracking system
    return {
      address,
      guildId,
      scholarsManaged: 0,
      activeScholars: 0,
      graduatedScholars: 0,
      scholarRetentionRate: 0,
      averageScholarEarnings: 0,
      scholarSatisfactionScore: 0,
      nftsLentOut: 0,
      lendingRevenue: 0,
      trainingSessionsHosted: 0,
      onboardingCompleted: 0,
    };
  }
}

// ============================================
// MOCK PROVIDER (For testing/demos)
// ============================================

export class MockDataProvider implements DataProvider {
  name = 'MockProvider';

  async fetchGamingMetrics(address: string, guildId: string): Promise<GamingMetrics> {
    // Generate realistic mock data based on address hash
    const seed = this.hashToNumber(address);
    
    return {
      address,
      guildId,
      totalMatchesPlayed: 100 + (seed % 900),
      matchesWon: 50 + (seed % 400),
      winRate: 0.4 + (seed % 30) / 100,
      totalTokensEarned: 1000 + (seed % 9000),
      tokensThisMonth: 100 + (seed % 900),
      earningsRank: 1 + (seed % 100),
      nftsRented: seed % 10,
      nftsOwned: seed % 20,
      nftValueManaged: (seed % 50) * 100,
      activePlayDays: 10 + (seed % 20),
      averageSessionHours: 1 + (seed % 4),
      currentStreak: seed % 30,
      longestStreak: 10 + (seed % 50),
      gameSpecificStats: {},
    };
  }

  async fetchGovernanceMetrics(address: string, guildId: string): Promise<GovernanceMetrics> {
    const seed = this.hashToNumber(address);
    
    return {
      address,
      guildId,
      proposalsVotedOn: seed % 50,
      totalProposals: 50 + (seed % 50),
      votingParticipationRate: 0.3 + (seed % 60) / 100,
      proposalsCreated: seed % 5,
      proposalsPassed: seed % 3,
      proposalSuccessRate: 0.5 + (seed % 40) / 100,
      delegatedVotingPower: (seed % 100) * 1000,
      delegatorsCount: seed % 15,
      forumPostsCreated: seed % 20,
      forumReplies: seed % 50,
      forumReactionsReceived: seed % 100,
    };
  }

  async fetchCommunityMetrics(address: string, guildId: string): Promise<CommunityMetrics> {
    const seed = this.hashToNumber(address);
    
    return {
      address,
      guildId,
      discordMessagesCount: 100 + (seed % 500),
      discordHelpfulReplies: seed % 50,
      discordEventsAttended: seed % 20,
      discordRolesCount: 2 + (seed % 5),
      guidesCreated: seed % 5,
      tutorialsShared: seed % 10,
      contentEngagement: seed % 200,
      membersReferred: seed % 10,
      activeReferrals: seed % 5,
      reportsSubmitted: seed % 5,
      moderationActions: seed % 10,
    };
  }

  async fetchScholarshipMetrics(address: string, guildId: string): Promise<ScholarshipMetrics> {
    const seed = this.hashToNumber(address);
    
    return {
      address,
      guildId,
      scholarsManaged: seed % 15,
      activeScholars: seed % 10,
      graduatedScholars: seed % 5,
      scholarRetentionRate: 0.6 + (seed % 30) / 100,
      averageScholarEarnings: 100 + (seed % 500),
      scholarSatisfactionScore: 3 + (seed % 20) / 10,
      nftsLentOut: seed % 20,
      lendingRevenue: (seed % 50) * 100,
      trainingSessionsHosted: seed % 10,
      onboardingCompleted: seed % 20,
    };
  }

  private hashToNumber(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}
