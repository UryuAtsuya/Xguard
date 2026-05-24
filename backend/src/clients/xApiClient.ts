import type { ProfileSnapshot, TweetSnapshot, XAccount } from "../../../shared/types.js";

export interface XApiClient {
  getAuthenticatedUser(): Promise<XAccount>;
  getProfileSnapshot(xAccountId: string): Promise<ProfileSnapshot>;
  getRecentTweets(xAccountId: string, limit: number): Promise<TweetSnapshot[]>;
}

export class MockXApiClient implements XApiClient {
  constructor(
    private readonly account: XAccount,
    private readonly profile: ProfileSnapshot,
    private readonly tweets: TweetSnapshot[],
  ) {}

  async getAuthenticatedUser(): Promise<XAccount> {
    return this.account;
  }

  async getProfileSnapshot(): Promise<ProfileSnapshot> {
    return this.profile;
  }

  async getRecentTweets(_xAccountId: string, limit: number): Promise<TweetSnapshot[]> {
    return this.tweets.slice(0, limit);
  }
}
