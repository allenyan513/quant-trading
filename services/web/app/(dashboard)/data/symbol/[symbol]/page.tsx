import { redirect } from "next/navigation";

/** Bare /data/symbol/[symbol] → land on the Overall tab. Server component, so
 * the redirect is safe (no client-tree React #310). */
export default async function SymbolIndex({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  redirect(`/data/symbol/${symbol}/overall`);
}
