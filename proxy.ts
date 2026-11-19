// Next 16 proxy (formerly middleware): guards server-only agent routes with a shared secret.
// See lib/internalAuth.ts for which paths are protected and how callers authenticate.
import { NextResponse, type NextRequest } from "next/server";
import { INTERNAL_SECRET_HEADER, requiresInternalSecret, safeEqual } from "@/lib/internalAuth";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (req.method === "OPTIONS" || !requiresInternalSecret(pathname, req.method)) {
    return NextResponse.next();
  }

  const expected = process.env.AGENT_INTERNAL_SECRET;
  if (!expected) {
    // Fail closed: a missing secret must never mean "open".
    return NextResponse.json({ error: "AGENT_INTERNAL_SECRET is not configured" }, { status: 503 });
  }
  const provided = req.headers.get(INTERNAL_SECRET_HEADER) ?? "";
  if (!safeEqual(provided, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/agent/:path*", "/api/approve"],
};
