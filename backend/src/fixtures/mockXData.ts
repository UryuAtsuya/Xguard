import type { ProfileSnapshot, TweetSnapshot, XAccount } from "../../../shared/types.js";

const now = new Date("2026-05-24T04:30:00.000Z").toISOString();

export const fixtureAccount: XAccount = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "user_fixture_001",
  xUserId: "1234567890",
  username: "xguard_creator",
  displayName: "XGuard Creator",
  avatarUrl: "https://example.com/avatar.png",
  status: "connected",
  connectedAt: now,
  lastBackupAt: now,
};

export const fixtureProfile: ProfileSnapshot = {
  id: "profile_fixture_001",
  xAccountId: fixtureAccount.id,
  displayName: fixtureAccount.displayName,
  bio: "Creator building in public.",
  avatarUrl: fixtureAccount.avatarUrl,
  followerCount: 12400,
  followingCount: 380,
  tweetCount: 2800,
  listedCount: 42,
  capturedAt: now,
};

export const fixtureTweets: TweetSnapshot[] = [
  {
    id: "tweet_snapshot_001",
    xAccountId: fixtureAccount.id,
    tweetId: "1800000000000000001",
    text: "XGuard is a read-only backup and proof-page prototype.",
    postedAt: "2026-05-20T09:00:00.000Z",
    likeCount: 120,
    repostCount: 18,
    replyCount: 7,
    quoteCount: 3,
    mediaUrls: [],
    capturedAt: now,
  },
  {
    id: "tweet_snapshot_002",
    xAccountId: fixtureAccount.id,
    tweetId: "1800000000000000002",
    text: "The product should help users restart after account loss without promising restoration.",
    postedAt: "2026-05-22T11:30:00.000Z",
    likeCount: 88,
    repostCount: 9,
    replyCount: 4,
    quoteCount: 1,
    mediaUrls: [],
    capturedAt: now,
  },
];
