import type { LoaderFunctionArgs } from "react-router";

import { segmentHueSpaceStream } from "~/lib/segmentHueSpace.server";
import { readPercentageParam } from "~/lib/color-utils";

const DEFAULT_SATURATION = 60;
const DEFAULT_LIGHTNESS = 50;

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const saturation = readPercentageParam(url, "s", DEFAULT_SATURATION);
  const lightness = readPercentageParam(url, "l", DEFAULT_LIGHTNESS);

  const stream = segmentHueSpaceStream({ saturation, lightness });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

export const config = {
  loader: {
    cache: "no-store" as const,
  },
};
