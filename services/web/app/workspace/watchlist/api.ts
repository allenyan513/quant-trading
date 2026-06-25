import { mutate } from "swr";

/** Revalidates both the rows (/api/watchlist) and the groups (/api/watchlist/lists). */
export const refresh = () => mutate((k) => typeof k === "string" && k.startsWith("/api/watchlist"));
