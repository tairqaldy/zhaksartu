import { NextResponse } from "next/server";
import { CLAUDE_TIERS, claudeAvailable } from "@/lib/engines";

export async function GET() {
  return NextResponse.json({
    claude: claudeAvailable(),
    claudeTiers: CLAUDE_TIERS,
  });
}
