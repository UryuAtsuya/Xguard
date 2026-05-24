import type { ProfileSnapshot, ProofPublicPayload, TweetSnapshot, XAccount } from "../../../shared/types.js";

export interface ProofDtoInput {
  account: XAccount;
  profileSnapshots: ProfileSnapshot[];
  tweetSnapshots: TweetSnapshot[];
}

export function buildProofPublicPayload(input: ProofDtoInput): ProofPublicPayload {
  const sortedTweets = [...input.tweetSnapshots].sort((a, b) => b.postedAt.localeCompare(a.postedAt));
  const sortedProfiles = [...input.profileSnapshots].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  const latestProfile = sortedProfiles[0];
  const oldestSnapshotDate = [...input.profileSnapshots.map((item) => item.capturedAt), ...input.tweetSnapshots.map((item) => item.capturedAt)]
    .sort()[0];
  const newestSnapshotDate = [...input.profileSnapshots.map((item) => item.capturedAt), ...input.tweetSnapshots.map((item) => item.capturedAt)]
    .sort()
    .at(-1);

  return {
    version: "v1",
    xUserId: input.account.xUserId,
    username: input.account.username,
    displayName: latestProfile?.displayName ?? input.account.displayName,
    profileSummary: latestProfile?.bio,
    profileImageUrl: latestProfile?.avatarUrl ?? input.account.avatarUrl,
    backedUpFrom: oldestSnapshotDate ?? new Date().toISOString(),
    backedUpUntil: newestSnapshotDate ?? new Date().toISOString(),
    snapshotCounts: {
      tweets: input.tweetSnapshots.length,
      profileSnapshots: input.profileSnapshots.length,
    },
    publicMetrics: latestProfile
      ? {
          followers: latestProfile.followerCount,
          following: latestProfile.followingCount,
          tweets: latestProfile.tweetCount,
          listed: latestProfile.listedCount,
        }
      : undefined,
    representativeTweets: sortedTweets.slice(0, 10).map((tweet) => ({
      tweetId: tweet.tweetId,
      text: tweet.text,
      postedAt: tweet.postedAt,
      publicMetrics: {
        likes: tweet.likeCount,
        reposts: tweet.repostCount,
        replies: tweet.replyCount,
        quotes: tweet.quoteCount,
      },
    })),
    redactionPolicyVersion: "v1",
  };
}
