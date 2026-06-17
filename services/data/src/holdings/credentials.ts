/**
 * Holdings (IBKR Flex) credentials, stored in data_holdings_accounts, keyed by
 * the user's id (account_id = Better Auth user.id). data owns this table and is
 * the only writer. The Flex token is encrypted at rest (AES-256-GCM, see
 * @qt/shared/crypto); web only ever reads a "connected" status, never the token.
 */
import { eq } from "drizzle-orm";
import { db, dbSchema, encryptSecret, decryptSecret, type FlexConfig } from "@qt/shared";

const { holdingsAccounts } = dbSchema;

/** Thrown by the sync path when no credentials have been saved yet. */
export class HoldingsNotConnectedError extends Error {
  constructor(accountId: string) {
    super(`no IBKR credentials saved for account '${accountId}' — connect via the holdings settings form`);
    this.name = "HoldingsNotConnectedError";
  }
}

/** Load (and decrypt) the Flex config for an account. Throws if unset. */
export async function getHoldingsFlexConfig(accountId: string): Promise<FlexConfig> {
  const rows = await db()
    .select({ token: holdingsAccounts.flexToken, queryId: holdingsAccounts.flexQueryId })
    .from(holdingsAccounts)
    .where(eq(holdingsAccounts.accountId, accountId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new HoldingsNotConnectedError(accountId);
  return { token: decryptSecret(row.token), queryId: row.queryId };
}

export interface SetHoldingsCredentialsInput {
  accountId: string;
  token: string;
  queryId: string;
  label?: string;
}

/** Upsert a user's credentials (token encrypted before store). */
export async function setHoldingsCredentials(input: SetHoldingsCredentialsInput): Promise<{ accountId: string }> {
  const accountId = input.accountId.trim();
  const token = input.token.trim();
  const queryId = input.queryId.trim();
  if (!accountId || !token || !queryId) throw new Error("accountId, token and queryId are required");

  const flexToken = encryptSecret(token);
  await db()
    .insert(holdingsAccounts)
    .values({ accountId, flexToken, flexQueryId: queryId, label: input.label ?? null, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: holdingsAccounts.accountId,
      set: { flexToken, flexQueryId: queryId, label: input.label ?? null, updatedAt: new Date() },
    });
  return { accountId };
}
