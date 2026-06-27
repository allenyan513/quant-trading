// 13F — legendary investor quarterly holdings (read-only; see #99). The read
// logic lives in @qt/shared/thirteenf-read (one source, shared with data's MCP
// endpoint); these wrappers just inject the gateway's db().

import { db } from "../db.js";
import * as shared13f from "@qt/shared/thirteenf-read";

export type { FilerSummary, FilerHeader, HoldingRow, FilerHoldings } from "@qt/shared/thirteenf-read";

export const list13fFilers = () => shared13f.list13fFilers(db());
export const get13fFilerHeader = (cik: string) => shared13f.get13fFilerHeader(db(), cik);
export const list13fHoldings = (cik: string) => shared13f.list13fHoldings(db(), cik);
