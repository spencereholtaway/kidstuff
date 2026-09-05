/**
 * Builds the reward tier list: every active reward, cheapest first, checked against the team's
 * permanent star bank (earned minus spent — never resets). A reward is claimable any time it's
 * affordable; claiming spends it immediately, so buying it again just means earning back up to
 * its cost — saving toward a pricier reward means passing up a cheaper one now.
 */
export function buildRewardTiers(rewards, bankAvailable) {
  return rewards
    .filter((r) => r.active)
    .sort((a, b) => a.starCost - b.starCost)
    .map((reward) => ({
      reward,
      unlocked: bankAvailable >= reward.starCost,
      progress: Math.min(bankAvailable, reward.starCost),
    }));
}
