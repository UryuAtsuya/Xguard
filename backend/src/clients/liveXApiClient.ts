import { createHash } from "node:crypto";
import type { ProfileSnapshot, TweetSnapshot, XAccount } from "../../../shared/types.js";
import type { XApiClient } from "./xApiClient.js";

interface XUserPayload {
  id: string;
  username: string;
  name: string;
  profile_image_url?: string;
  description?: string;
  public_metrics?: {
    followers_count?: number;
    following_count?: number;
    tweet_count?: number;
    listed_count?: number;
  };
}

interface XTweetPayload {
  id: string;
  text: string;
  created_at: string;
  public_metrics?: {
    like_count?: number;
    retweet_count?: number;
    reply_count?: number;
    quote_count?: number;
    bookmark_count?: number;
    impression_count?: number;
  };
}

export class LiveXApiClient implements XApiClient {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private authenticatedUser?: XUserPayload;

  constructor(options: {
    accessToken: string;
    fetchImpl?: typeof fetch;
    now?: () => Date;
  }) {
    const accessToken = options.accessToken.trim();
    if (!accessToken) {
      throw new Error("invalid_x_access_token");
    }

    this.accessToken = accessToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  private readonly accessToken: string;

  async getAuthenticatedUser(): Promise<XAccount> {
    const user = await this.fetchAuthenticatedUser();
    const connectedAt = this.now().toISOString();

    return {
      id: buildLiveXAccountId(user.id),
      userId: buildLiveXUserId(user.id),
      xUserId: user.id,
      username: user.username,
      displayName: user.name,
      avatarUrl: user.profile_image_url,
      status: "connected",
      connectedAt,
    };
  }

  async getProfileSnapshot(xAccountId: string): Promise<ProfileSnapshot> {
    const user = await this.fetchAuthenticatedUser();
    assertMatchingAccountId(xAccountId, user.id);
    const capturedAt = this.now().toISOString();

    return {
      id: stableUuid(`x-profile:${user.id}:${capturedAt}`),
      xAccountId,
      displayName: user.name,
      bio: user.description,
      avatarUrl: user.profile_image_url,
      followerCount: optionalMetric(user.public_metrics?.followers_count),
      followingCount: optionalMetric(user.public_metrics?.following_count),
      tweetCount: optionalMetric(user.public_metrics?.tweet_count),
      listedCount: optionalMetric(user.public_metrics?.listed_count),
      capturedAt,
    };
  }

  async getRecentTweets(xAccountId: string, limit: number): Promise<TweetSnapshot[]> {
    const user = await this.fetchAuthenticatedUser();
    assertMatchingAccountId(xAccountId, user.id);
    const params = new URLSearchParams({
      max_results: String(Math.min(100, Math.max(5, limit))),
      "tweet.fields": "created_at,public_metrics",
      exclude: "retweets,replies",
    });
    const response = await this.requestJson(`https://api.x.com/2/users/${encodeURIComponent(user.id)}/tweets?${params}`);
    const tweets = parseTweetList(response).slice(0, limit);
    const capturedAt = this.now().toISOString();

    return tweets.map((tweet) => ({
      id: stableUuid(`x-tweet:${user.id}:${tweet.id}:${capturedAt}`),
      xAccountId,
      tweetId: tweet.id,
      text: tweet.text,
      postedAt: tweet.created_at,
      likeCount: optionalMetric(tweet.public_metrics?.like_count),
      repostCount: optionalMetric(tweet.public_metrics?.retweet_count),
      replyCount: optionalMetric(tweet.public_metrics?.reply_count),
      quoteCount: optionalMetric(tweet.public_metrics?.quote_count),
      bookmarkCount: optionalMetric(tweet.public_metrics?.bookmark_count),
      impressionCount: optionalMetric(tweet.public_metrics?.impression_count),
      mediaUrls: [],
      capturedAt,
    }));
  }

  private async fetchAuthenticatedUser(): Promise<XUserPayload> {
    if (this.authenticatedUser) {
      return this.authenticatedUser;
    }

    const params = new URLSearchParams({
      "user.fields": "id,name,username,profile_image_url,description,public_metrics",
    });
    const response = await this.requestJson(`https://api.x.com/2/users/me?${params}`);
    this.authenticatedUser = parseUser(response);
    return this.authenticatedUser;
  }

  private async requestJson(url: string): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new Error("x_api_network_error");
    }

    if (!response.ok) {
      throw new Error(`x_api_request_failed:${response.status}`);
    }

    try {
      return await response.json();
    } catch {
      throw new Error("x_api_invalid_response");
    }
  }
}

export function buildLiveXAccountId(xUserId: string): string {
  return stableUuid(`x-account:${xUserId}`);
}

export function buildLiveXUserId(xUserId: string): string {
  return stableUuid(`x-user:${xUserId}`);
}

function stableUuid(value: string): string {
  const bytes = createHash("sha256").update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function parseUser(value: unknown): XUserPayload {
  const data = getResponseData(value);
  if (!data || typeof data !== "object") {
    throw new Error("x_api_invalid_user_response");
  }

  const record = data as Record<string, unknown>;
  const id = requiredString(record.id, "x_api_invalid_user_response");
  const username = requiredString(record.username, "x_api_invalid_user_response");
  const name = requiredString(record.name, "x_api_invalid_user_response");
  if (!/^\d+$/.test(id) || !/^[A-Za-z0-9_]{1,15}$/.test(username)) {
    throw new Error("x_api_invalid_user_response");
  }

  return {
    id,
    username,
    name,
    profile_image_url: optionalHttpsUrl(record.profile_image_url, "x_api_invalid_user_response"),
    description: optionalString(record.description, "x_api_invalid_user_response"),
    public_metrics: parseMetrics(
      record.public_metrics,
      ["followers_count", "following_count", "tweet_count", "listed_count"],
      "x_api_invalid_user_response",
    ),
  };
}

function parseTweetList(value: unknown): XTweetPayload[] {
  const data = getResponseData(value);
  if (data === undefined) {
    return [];
  }
  if (!Array.isArray(data)) {
    throw new Error("x_api_invalid_tweets_response");
  }

  return data.map((tweet) => {
    if (!tweet || typeof tweet !== "object") {
      throw new Error("x_api_invalid_tweets_response");
    }

    const record = tweet as Record<string, unknown>;
    const id = requiredString(record.id, "x_api_invalid_tweets_response");
    const text = requiredString(record.text, "x_api_invalid_tweets_response", true);
    const createdAt = requiredString(record.created_at, "x_api_invalid_tweets_response");
    if (!/^\d+$/.test(id) || !Number.isFinite(Date.parse(createdAt))) {
      throw new Error("x_api_invalid_tweets_response");
    }

    return {
      id,
      text,
      created_at: createdAt,
      public_metrics: parseMetrics(
        record.public_metrics,
        [
          "like_count",
          "retweet_count",
          "reply_count",
          "quote_count",
          "bookmark_count",
          "impression_count",
        ],
        "x_api_invalid_tweets_response",
      ),
    };
  });
}

function getResponseData(value: unknown): unknown {
  return value && typeof value === "object" && "data" in value ? value.data : undefined;
}

function assertMatchingAccountId(xAccountId: string, xUserId: string): void {
  if (xAccountId !== buildLiveXAccountId(xUserId)) {
    throw new Error("x_api_account_mismatch");
  }
}

function optionalMetric(value: number | undefined): number | undefined {
  return Number.isFinite(value) && value !== undefined && value >= 0 ? value : undefined;
}

function requiredString(value: unknown, errorCode: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) {
    throw new Error(errorCode);
  }
  return value;
}

function optionalString(value: unknown, errorCode: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(errorCode);
  }
  return value;
}

function optionalHttpsUrl(value: unknown, errorCode: string): string | undefined {
  const stringValue = optionalString(value, errorCode);
  if (stringValue === undefined) {
    return undefined;
  }

  try {
    const url = new URL(stringValue);
    if (url.protocol !== "https:") {
      throw new Error(errorCode);
    }
    return url.toString();
  } catch {
    throw new Error(errorCode);
  }
}

function parseMetrics<K extends string>(
  value: unknown,
  keys: readonly K[],
  errorCode: string,
): Partial<Record<K, number>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(errorCode);
  }

  const record = value as Record<string, unknown>;
  const metrics: Partial<Record<K, number>> = {};
  for (const key of keys) {
    const metric = record[key];
    if (metric === undefined) {
      continue;
    }
    if (typeof metric !== "number" || !Number.isInteger(metric) || metric < 0) {
      throw new Error(errorCode);
    }
    metrics[key] = metric;
  }
  return metrics;
}
