/**
 * Holdings (IBKR Flex) credentials, stored in data_holdings_accounts. Single-user
 * today (account_id = config.holdingsAccountId()); the row shape generalizes to
 * multi-user. Token is plaintext by explicit choice — data owns this table and
 * is the only writer; web reads a masked status only.
 */
import { eq } from "drizzle-orm";
import { db, dbSchema, config, type FlexConfig } from "@qt/shared";

const { holdingsAccounts } = dbSchema;

/** Thrown by the sync path when no credentials have been saved yet. */
export class HoldingsNotConnectedError extends Error {
  constructor(accountId: string) {
    super(`no IBKR credentials saved for account '${accountId}' — connect via the holdings settings form`);
    this.name = "HoldingsNotConnectedError";
  }
}

/** Load the Flex config for an account. Throws HoldingsNotConnectedError if unset. */
export async function getHoldingsFlexConfig(accountId: string): Promise<FlexConfig> {
  const rows = await db()
    .select({ token: holdingsAccounts.flexToken, queryId: holdingsAccounts.flexQueryId })
    .from(holdingsAccounts)
    .where(eq(holdingsAccounts.accountId, accountId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new HoldingsNotConnectedError(accountId);
  return { token: row.token, queryId: row.queryId };
}

export interface SetHoldingsCredentialsInput {
  token: string;
  queryId: string;
  label?: string;
}

/** Upsert the credentials for the configured account (accountId is server-set). */
export async function setHoldingsCredentials(input: SetHoldingsCredentialsInput): Promise<{ accountId: string }> {
  const accountId = config.holdingsAccountId();
  const token = input.token.trim();
  const queryId = input.queryId.trim();
  if (!token || !queryId) throw new Error("token and queryId are required");

  await db()
    .insert(holdingsAccounts)
    .values({ accountId, flexToken: token, flexQueryId: queryId, label: input.label ?? null, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: holdingsAccounts.accountId,
      set: { flexToken: token, flexQueryId: queryId, label: input.label ?? null, updatedAt: new Date() },
    });
  return { accountId };
}
