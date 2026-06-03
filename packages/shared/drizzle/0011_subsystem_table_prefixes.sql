ALTER TABLE "universe" RENAME TO "data_universe";
--> statement-breakpoint
ALTER TABLE "watchlist" RENAME TO "data_watchlist";
--> statement-breakpoint
ALTER TABLE "candidates" RENAME TO "data_candidates";
--> statement-breakpoint
ALTER TABLE "daily_prices" RENAME TO "data_daily_prices";
--> statement-breakpoint
ALTER TABLE "income_statement" RENAME TO "data_income_statement";
--> statement-breakpoint
ALTER TABLE "balance_sheet" RENAME TO "data_balance_sheet";
--> statement-breakpoint
ALTER TABLE "cash_flow" RENAME TO "data_cash_flow";
--> statement-breakpoint
ALTER TABLE "financial_ratios" RENAME TO "data_financial_ratios";
--> statement-breakpoint
ALTER TABLE "analyst_estimates" RENAME TO "data_analyst_estimates";
--> statement-breakpoint
ALTER TABLE "events" RENAME TO "data_events";
--> statement-breakpoint
ALTER TABLE "notifications" RENAME TO "data_notifications";
--> statement-breakpoint
ALTER TABLE "news_items" RENAME TO "data_news_items";
--> statement-breakpoint
ALTER TABLE "valuation_snapshots" RENAME TO "alpha_valuation_snapshots";
--> statement-breakpoint
ALTER TABLE "trading_signals" RENAME TO "alpha_trading_signals";
--> statement-breakpoint
ALTER TABLE "signal_audits" RENAME TO "alpha_signal_audits";
--> statement-breakpoint
ALTER TABLE "signal_deliveries" RENAME TO "alpha_signal_deliveries";
--> statement-breakpoint
ALTER TABLE "positions" RENAME TO "portfolio_positions";
--> statement-breakpoint
ALTER TABLE "logs" RENAME TO "system_logs";
--> statement-breakpoint
ALTER TABLE "data_analyst_estimates" RENAME CONSTRAINT "analyst_estimates_symbol_period_fiscal_date_pk" TO "data_analyst_estimates_symbol_period_fiscal_date_pk";
--> statement-breakpoint
ALTER TABLE "data_balance_sheet" RENAME CONSTRAINT "balance_sheet_symbol_period_fiscal_date_pk" TO "data_balance_sheet_symbol_period_fiscal_date_pk";
--> statement-breakpoint
ALTER TABLE "data_cash_flow" RENAME CONSTRAINT "cash_flow_symbol_period_fiscal_date_pk" TO "data_cash_flow_symbol_period_fiscal_date_pk";
--> statement-breakpoint
ALTER TABLE "data_daily_prices" RENAME CONSTRAINT "daily_prices_symbol_trade_date_pk" TO "data_daily_prices_symbol_trade_date_pk";
--> statement-breakpoint
ALTER TABLE "data_financial_ratios" RENAME CONSTRAINT "financial_ratios_symbol_period_fiscal_date_pk" TO "data_financial_ratios_symbol_period_fiscal_date_pk";
--> statement-breakpoint
ALTER TABLE "data_income_statement" RENAME CONSTRAINT "income_statement_symbol_period_fiscal_date_pk" TO "data_income_statement_symbol_period_fiscal_date_pk";
