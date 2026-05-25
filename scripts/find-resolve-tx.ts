/**
 * Find the resolve tx hash for a given claim id by scanning ClaimResolved
 * events. Useful when the production oracle resolved the claim out-of-band
 * (e.g. the Railway worker picked it up before a demo script could) and we
 * need the tx URL for documentation.
 *
 * Usage: npx tsx --env-file-if-exists=.env.local scripts/find-resolve-tx.ts <id>
 */

import { decodeEventLog, parseAbiItem } from "viem";
import {
  createArcPublicClient,
  getContractAddress,
  getExplorerTxUrl,
  getDeployBlock,
  paginatedGetLogs,
} from "../lib/arc";

const RESOLVED_EVENT = parseAbiItem(
  "event ClaimResolved(uint256 indexed id, uint8 winnerSide, string summary, uint8 confidence, bytes32 evidenceHash)",
);

const SIDE_LABEL = ["NONE", "CREATOR", "CHALLENGERS", "DRAW", "UNRESOLVABLE"];

async function main() {
  const id = Number(process.argv[2]);
  if (!id) throw new Error("Usage: find-resolve-tx.ts <id>");

  const client = createArcPublicClient();
  const contract = getContractAddress();
  const fromBlock = getDeployBlock();

  const logs = await paginatedGetLogs(
    client,
    { address: contract, event: RESOLVED_EVENT, args: { id: BigInt(id) } as any },
    fromBlock,
  );

  if (logs.length === 0) {
    console.error(`No ClaimResolved event found for claim #${id}.`);
    process.exit(1);
  }

  // Take the most recent (should only be one anyway — resolve is final)
  const log = logs[logs.length - 1];
  const decoded = decodeEventLog({
    abi: [RESOLVED_EVENT],
    data: log.data,
    topics: log.topics,
  });
  const { winnerSide, summary, confidence, evidenceHash } = decoded.args as {
    winnerSide: number;
    summary: string;
    confidence: number;
    evidenceHash: `0x${string}`;
  };

  console.log(`Claim #${id} resolved on chain:`);
  console.log(`  tx           : ${getExplorerTxUrl(log.transactionHash)}`);
  console.log(`  block        : ${log.blockNumber}`);
  console.log(`  winner       : ${SIDE_LABEL[winnerSide] ?? winnerSide}`);
  console.log(`  confidence   : ${confidence}%`);
  console.log(`  evidenceHash : ${evidenceHash}`);
  console.log(`  summary      : ${summary}`);
}

main().catch((e) => {
  console.error("find-resolve-tx failed:", e?.message ?? e);
  process.exit(1);
});
