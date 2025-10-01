import type { Route } from "./+types/swatches.stream";

import { streamSegmentHueSpace } from "~/lib/segmentHueSpace.server";
import { readPercentageParam } from "~/lib/color-utils";
import { DEFAULT_LIGHTNESS, DEFAULT_SATURATION } from "~/lib/defaults";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const saturation = readPercentageParam(url, "s", DEFAULT_SATURATION);
  const lightness = readPercentageParam(url, "l", DEFAULT_LIGHTNESS);

  try {
    const stream = streamSegmentHueSpace({ saturation, lightness });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to stream colors.";
    const encoder = new TextEncoder();
    const body = encoder.encode(`${JSON.stringify({ error: message })}\n`);

    return new Response(body, {
      status: 500,
      headers: {
        "Content-Type": "text/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  }
}
