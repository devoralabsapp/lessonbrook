import { hasFirebaseServerConfig } from "@/lib/firebase/server-config";
import { json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return json({ available: hasFirebaseServerConfig() });
}
