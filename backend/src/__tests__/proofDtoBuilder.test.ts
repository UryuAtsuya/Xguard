import { describe, expect, it } from "vitest";
import { fixtureAccount, fixtureProfile, fixtureTweets } from "../fixtures/mockXData.js";
import { buildProofPublicPayload } from "../services/proofDtoBuilder.js";

describe("buildProofPublicPayload", () => {
  it("builds a redacted public DTO instead of raw X payload", () => {
    const payload = buildProofPublicPayload({
      account: fixtureAccount,
      profileSnapshots: [fixtureProfile],
      tweetSnapshots: fixtureTweets,
    });

    expect(payload.version).toBe("v1");
    expect(payload.username).toBe("xguard_creator");
    expect(payload.snapshotCounts).toEqual({ tweets: 2, profileSnapshots: 1 });
    expect(payload.representativeTweets).toHaveLength(2);
    expect(JSON.stringify(payload)).not.toContain("raw_payload");
  });

  it("excludes deleted, protected, and withheld tweets from the public DTO", () => {
    const [publicTweet] = fixtureTweets;
    const payload = buildProofPublicPayload({
      account: fixtureAccount,
      profileSnapshots: [fixtureProfile],
      tweetSnapshots: [
        publicTweet,
        { ...publicTweet, id: "deleted-snapshot", tweetId: "deleted-tweet", deletedAt: "2026-05-31T00:00:00.000Z" },
        { ...publicTweet, id: "protected-snapshot", tweetId: "protected-tweet", protectedAt: "2026-05-31T00:00:00.000Z" },
        { ...publicTweet, id: "withheld-snapshot", tweetId: "withheld-tweet", withheldAt: "2026-05-31T00:00:00.000Z" },
      ],
    });

    expect(payload.snapshotCounts.tweets).toBe(1);
    expect(payload.representativeTweets).toEqual([
      expect.objectContaining({
        tweetId: publicTweet.tweetId,
        text: publicTweet.text,
      }),
    ]);
    expect(JSON.stringify(payload)).not.toContain("deleted-tweet");
    expect(JSON.stringify(payload)).not.toContain("protected-tweet");
    expect(JSON.stringify(payload)).not.toContain("withheld-tweet");
  });
});
