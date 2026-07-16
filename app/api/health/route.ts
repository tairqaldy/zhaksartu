import { NextResponse } from "next/server";
import { claudeAvailable, engineInfo, localHealthy } from "@/lib/engines";

export async function GET() {
  const local = await localHealthy();
  return NextResponse.json({
    local,
    claude: claudeAvailable(),
    localModel: engineInfo.localModel,
    claudeModel: engineInfo.claudeModel,
  });
}
