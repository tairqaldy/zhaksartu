import { NextResponse } from "next/server";
import { CLAUDE_TIERS, claudeAvailable, engineInfo, localHealthy } from "@/lib/engines";

export async function GET() {
  const local = await localHealthy();
  return NextResponse.json({
    local,
    claude: claudeAvailable(),
    localModel: engineInfo.localModel,
    claudeTiers: CLAUDE_TIERS,
  });
}
