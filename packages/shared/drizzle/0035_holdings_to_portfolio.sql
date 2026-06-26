-- Hand-written rename (drizzle-kit can't auto-rename without a TTY). Move the IBKR
-- holdings tables from the data_ prefix to portfolio_ — ownership moved from the
-- data service to the portfolio service (Live ledger). RENAME, never drop+create,
-- so existing rows are preserved. Composite/PK constraint names embed the table
-- name, so rename them too to keep future drizzle diffs clean.
ALTER TABLE "data_holdings_accounts" RENAME TO "portfolio_holdings_accounts";--> statement-breakpoint
ALTER TABLE "data_holdings_nav_history" RENAME TO "portfolio_holdings_nav_history";--> statement-breakpoint
ALTER TABLE "data_holdings_trades" RENAME TO "portfolio_holdings_trades";--> statement-breakpoint
ALTER TABLE "data_holdings_positions" RENAME TO "portfolio_holdings_positions";--> statement-breakpoint
ALTER TABLE "portfolio_holdings_accounts" RENAME CONSTRAINT "data_holdings_accounts_pkey" TO "portfolio_holdings_accounts_pkey";--> statement-breakpoint
ALTER TABLE "portfolio_holdings_nav_history" RENAME CONSTRAINT "data_holdings_nav_history_account_id_date_pk" TO "portfolio_holdings_nav_history_account_id_date_pk";--> statement-breakpoint
ALTER TABLE "portfolio_holdings_trades" RENAME CONSTRAINT "data_holdings_trades_account_id_external_trade_id_pk" TO "portfolio_holdings_trades_account_id_external_trade_id_pk";--> statement-breakpoint
ALTER TABLE "portfolio_holdings_positions" RENAME CONSTRAINT "data_holdings_positions_account_id_as_of_date_symbol_option_typ" TO "portfolio_holdings_positions_account_id_as_of_date_symbol_option_type_strike_expiry_pk";
