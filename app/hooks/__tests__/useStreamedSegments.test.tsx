import { act, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Location, Navigation } from "react-router";

import type { HueSegment } from "~/shared/types";
import { useStreamedSegments } from "../useStreamedSegments";
import { useEffect } from "react";

interface TestComponentProps {
  readonly navigation: Navigation;
  readonly initialSegments: HueSegment[];
  readonly onUpdate: (value: {
    segments: HueSegment[];
    hasStreamedPartial: boolean;
  }) => void;
}

function TestComponent({ navigation, initialSegments, onUpdate }: TestComponentProps) {
  const result = useStreamedSegments({ navigation, initialSegments });

  useEffect(() => {
    onUpdate(result);
  }, [result.segments, result.hasStreamedPartial, onUpdate]);

  return null;
}

const encoder = new TextEncoder();

const initialSegments: HueSegment[] = [
  {
    startHue: 0,
    endHue: 120,
    color: {
      name: "Red",
      rgb: { value: "rgb(255, 0, 0)", r: 255, g: 0, b: 0 },
      hsl: { value: "hsl(0, 50%, 50%)", h: 0, s: 50, l: 50 },
    },
  },
];

function createIdleNavigation(): Navigation {
  return {
    state: "idle",
    location: undefined,
    formMethod: undefined,
    formAction: undefined,
    formEncType: undefined,
    formData: undefined,
    json: undefined,
    text: undefined,
  };
}

function createLocation(search: string): Location {
  return {
    pathname: "/",
    search,
    hash: "",
    state: null,
    key: "test",
  };
}

function createLoadingNavigation(search: string): Navigation {
  return {
    state: "loading",
    location: createLocation(search),
    formMethod: undefined,
    formAction: undefined,
    formEncType: undefined,
    formData: undefined,
    json: undefined,
    text: undefined,
  };
}

function createStream() {
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(startController) {
      controller = startController;
    },
  });

  return {
    stream,
    enqueue(payload: string) {
      controller?.enqueue(encoder.encode(payload));
    },
    close() {
      controller?.close();
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useStreamedSegments", () => {
  it("resets to the latest loader segments", async () => {
    const updates: Array<{
      segments: HueSegment[];
      hasStreamedPartial: boolean;
    }> = [];

    const { rerender } = render(
      <TestComponent
        navigation={createIdleNavigation()}
        initialSegments={initialSegments}
        onUpdate={(value) => {
          updates.push(value);
        }}
      />,
    );

    await waitFor(() => {
      expect(updates.at(-1)?.segments).toEqual(initialSegments);
      expect(updates.at(-1)?.hasStreamedPartial).toBe(false);
    });

    const nextSegments: HueSegment[] = [
      {
        startHue: 120,
        endHue: 240,
        color: {
          name: "Green",
          rgb: { value: "rgb(0, 255, 0)", r: 0, g: 255, b: 0 },
          hsl: { value: "hsl(120, 50%, 50%)", h: 120, s: 50, l: 50 },
        },
      },
    ];

    rerender(
      <TestComponent
        navigation={createIdleNavigation()}
        initialSegments={nextSegments}
        onUpdate={(value) => {
          updates.push(value);
        }}
      />,
    );

    await waitFor(() => {
      expect(updates.at(-1)?.segments).toEqual(nextSegments);
      expect(updates.at(-1)?.hasStreamedPartial).toBe(false);
    });
  });

  it("streams NDJSON payloads during navigation", async () => {
    const { stream, enqueue, close } = createStream();

    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(stream, {
          status: 200,
          headers: { "Content-Type": "text/x-ndjson" },
        }),
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const updates: Array<{
      segments: HueSegment[];
      hasStreamedPartial: boolean;
    }> = [];

    const { rerender } = render(
      <TestComponent
        navigation={createIdleNavigation()}
        initialSegments={initialSegments}
        onUpdate={(value) => {
          updates.push(value);
        }}
      />,
    );

    await waitFor(() => {
      expect(updates).not.toHaveLength(0);
    });

    const loadingNavigation = createLoadingNavigation("?s=60&l=40");

    rerender(
      <TestComponent
        navigation={loadingNavigation}
        initialSegments={initialSegments}
        onUpdate={(value) => {
          updates.push(value);
        }}
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/swatches.stream?s=60&l=40",
        expect.objectContaining({
          headers: { Accept: "text/x-ndjson" },
          signal: expect.any(AbortSignal),
        }),
      );
    });

    const streamedSegments: HueSegment[] = [
      {
        startHue: 0,
        endHue: 90,
        color: {
          name: "Coral",
          rgb: { value: "rgb(240, 128, 128)", r: 240, g: 128, b: 128 },
          hsl: { value: "hsl(0, 60%, 72%)", h: 0, s: 60, l: 72 },
        },
      },
    ];

    await act(async () => {
      enqueue(`${JSON.stringify({ segments: streamedSegments })}\n`);
      close();
    });

    await waitFor(() => {
      expect(updates.at(-1)).toEqual({
        segments: streamedSegments,
        hasStreamedPartial: true,
      });
    });
  });
});
