/**
 * Guild Reputation Engine
 * 
 * A customizable on-chain reputation system for Gaming Guild DAOs.
 * Built for YGG, Merit Circle, Avocado DAO, and similar organizations.
 * 
 * Features:
 * - Multi-category scoring (gaming, governance, community, scholarship)
 * - Tier system with gamified progression
 * - Soulbound-style badge achievements
 * - Configurable weights per guild
 * - Multiple data provider integrations
 * - REST API for easy integration
 * 
 * @author PineOT (Tobias)
 * @version 1.0.0
 * @license MIT
 */

// Export types
export * from './types';

// Export services
export { GuildScoreCalculator, defaultCalculator } from './services/ScoreCalculator';

// Export providers
export {
  SnapshotProvider,
  OnChainProvider,
  DiscordProvider,
  GameApiProvider,
  AggregatedDataProvider,
  MockDataProvider,
} from './providers/DataProviders';

// Export API
export { app } from './api/server';

// Quick start helper
import { GuildScoreCalculator } from './services/ScoreCalculator';
import { MockDataProvider } from './providers/DataProviders';
import { GuildConfig, ReputationScore } from './types';

/**
 * Quick start function for getting a reputation score
 */
export async function getReputationScore(
  address: string,
  guildId: string,
  config?: Partial<GuildConfig>
): Promise<ReputationScore> {
  const provider = new MockDataProvider();
  const calculator = new GuildScoreCalculator(config?.customWeights);

  const [gaming, governance, community, scholarship] = await Promise.all([
    provider.fetchGamingMetrics(address, guildId),
    provider.fetchGovernanceMetrics(address, guildId),
    provider.fetchCommunityMetrics(address, guildId),
    provider.fetchScholarshipMetrics(address, guildId),
  ]);

  return calculator.calculateScore(gaming, governance, community, scholarship);
}

// CLI helper
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args[0] === 'serve') {
    // Start API server
    require('./api/server');
  } else if (args[0] === 'score' && args[1]) {
    // Calculate score for an address
    const address = args[1];
    const guildId = args[2] || 'demo-guild';
    
    getReputationScore(address, guildId).then(score => {
      console.log('\nGuild Reputation Score');
      console.log('======================\n');
      console.log(`Address: ${score.address}`);
      console.log(`Total Score: ${score.totalScore}`);
      console.log(`Tier: ${score.tier.toUpperCase()}`);
      console.log('\nBreakdown:');
      Object.entries(score.breakdown).forEach(([cat, val]) => {
        console.log(`  ${cat}: ${val}`);
      });
      console.log(`\nBadges Earned: ${score.badges.length}`);
      score.badges.forEach(b => {
        console.log(`  - ${b.name} (${b.rarity})`);
      });
    });
  } else {
    console.log(`
Guild Reputation Engine v1.0.0
==============================

Usage:
  npx ts-node src/index.ts serve              Start API server
  npx ts-node src/index.ts score <address>    Calculate score for address

Examples:
  npx ts-node src/index.ts serve
  npx ts-node src/index.ts score 0x1234...5678
  npx ts-node src/index.ts score 0x1234...5678 my-guild-id
    `);
  }
}
