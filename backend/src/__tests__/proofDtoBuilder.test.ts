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
});
