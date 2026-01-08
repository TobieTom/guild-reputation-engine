/**
 * Snapshot Governance Data Provider
 *
 * Fetches real governance voting data from Snapshot GraphQL API:
 * - Total votes cast
 * - Spaces voted in with counts
 * - Recent voting activity
 *
 * @author PineOT (Tobias)
 */

// Configuration from environment variables with defaults
const SNAPSHOT_GRAPHQL_API = process.env.SNAPSHOT_API_URL || 'https://hub.snapshot.org/graphql';
const REQUEST_TIMEOUT_MS = parseInt(process.env.SNAPSHOT_TIMEOUT_MS || '30000', 10);
const MAX_VOTES_PER_QUERY = 100;

export interface SnapshotVote {
  id: string;
  voter: string;
  choice: number | number[] | Record<string, number>;
  created: number;
  space: {
    id: string;
    name?: string;
  };
  proposal: {
    id: string;
    title: string;
  };
}

export interface SpaceVoteCount {
  spaceId: string;
  spaceName: string;
  voteCount: number;
}

export interface RecentVote {
  proposalTitle: string;
  space: string;
  spaceName: string;
  choice: number | number[] | Record<string, number>;
  timestamp: number;
  date: string;
}

export interface SnapshotData {
  address: string;
  totalVotes: number;
  spacesVotedIn: SpaceVoteCount[];
  recentVotes: RecentVote[];
  timestamp: string;
}

interface GraphQLResponse {
  data?: {
    votes?: SnapshotVote[];
  };
  errors?: Array<{ message: string }>;
}

/**
 * Validates an Ethereum address format
 * @throws Error if address is invalid
 */
function validateAddress(address: string): string {
  if (!address || typeof address !== 'string') {
    throw new Error('Address is required and must be a string');
  }

  const trimmed = address.trim().toLowerCase();

  // Basic Ethereum address validation
  if (!/^0x[a-f0-9]{40}$/i.test(trimmed)) {
    throw new Error(`Invalid Ethereum address format: ${trimmed.substring(0, 20)}...`);
  }

  return trimmed;
}

/**
 * Sanitizes a string for safe inclusion in responses
 * Removes potential XSS vectors
 */
function sanitizeString(str: string | undefined | null): string {
  if (!str) return '';
  return str
    .replace(/[<>]/g, '')
    .substring(0, 500); // Limit length
}

/**
 * Fetch all Snapshot governance data for a given wallet address
 * @param address - Ethereum address to query
 * @returns SnapshotData object with voting history
 * @throws Error if address is invalid or API calls fail
 */
export async function getSnapshotData(address: string): Promise<SnapshotData> {
  const validatedAddress = validateAddress(address);

  // GraphQL query for votes (parameterized to prevent injection)
  const query = `
    query GetVotes($voter: String!) {
      votes(
        first: ${MAX_VOTES_PER_QUERY}
        where: { voter: $voter }
        orderBy: "created"
        orderDirection: desc
      ) {
        id
        voter
        choice
        created
        space {
          id
          name
        }
        proposal {
          id
          title
        }
      }
    }
  `;

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(SNAPSHOT_GRAPHQL_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { voter: validatedAddress },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const responseData: GraphQLResponse = await response.json();

    if (!response.ok) {
      throw new Error(`Snapshot API error: ${response.status} ${response.statusText}`);
    }

    if (responseData.errors && responseData.errors.length > 0) {
      throw new Error(`Snapshot GraphQL error: ${responseData.errors[0].message}`);
    }

    const votes: SnapshotVote[] = responseData.data?.votes || [];

    // Calculate spaces voted in with counts
    const spaceMap = new Map<string, { name: string; count: number }>();

    for (const vote of votes) {
      if (!vote.space?.id) continue;

      const spaceId = sanitizeString(vote.space.id);
      const spaceName = sanitizeString(vote.space.name) || spaceId;

      const existing = spaceMap.get(spaceId);
      if (existing) {
        existing.count++;
      } else {
        spaceMap.set(spaceId, { name: spaceName, count: 1 });
      }
    }

    // Convert to array and sort by vote count
    const spacesVotedIn: SpaceVoteCount[] = Array.from(spaceMap.entries())
      .map(([spaceId, data]) => ({
        spaceId,
        spaceName: data.name,
        voteCount: data.count,
      }))
      .sort((a, b) => b.voteCount - a.voteCount);

    // Get last 10 votes with sanitized data
    const recentVotes: RecentVote[] = votes.slice(0, 10).map(vote => ({
      proposalTitle: sanitizeString(vote.proposal?.title) || 'Unknown Proposal',
      space: sanitizeString(vote.space?.id) || 'unknown',
      spaceName: sanitizeString(vote.space?.name) || sanitizeString(vote.space?.id) || 'Unknown',
      choice: vote.choice,
      timestamp: vote.created,
      date: new Date(vote.created * 1000).toISOString(),
    }));

    return {
      address: validatedAddress,
      totalVotes: votes.length,
      spacesVotedIn,
      recentVotes,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Snapshot API request timeout');
    }

    throw error;
  }
}
