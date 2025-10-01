import { act, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Location, Navigation } from "react-router";
import { useEffect } from "react";

import type { HueSegment } from "~/shared/types";
import { useStreamedSegments } from "../useStreamedSegments";

type StreamResult = ReturnType<typeof useStreamedSegments>;

type UpdateHandler = (value: StreamResult) => void;

interface TestComponentProps {
  readonly navigation: Navigation;
  readonly search: string;
  readonly onUpdate: UpdateHandler;
}

function TestComponent({ navigation, search, onUpdate }: TestComponentProps) {
  const result = useStreamedSegments({ navigation, search });

  useEffect(() => {
    onUpdate(result);
  }, [result, onUpdate]);

  return null;
}

const encoder = new TextEncoder();

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
  it("streams segments for the current search", async () => {
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

    const updates: StreamResult[] = [];

    render(
      <TestComponent
        navigation={createIdleNavigation()}
        search="?s=50&l=50"
        onUpdate={(value) => {
          updates.push(value);
        }}
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:3000/swatches.stream?s=50&l=50",
        expect.objectContaining({
          headers: { Accept: "text/x-ndjson" },
          signal: expect.any(AbortSignal),
        }),
      );
    });

    await waitFor(() => {
      expect(updates.at(-1)).toMatchObject({
        segments: [],
        hasStreamedPartial: false,
        isStreaming: true,
        error: null,
      });
    });

    const streamedSegments: HueSegment[] = [
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

    await act(async () => {
      enqueue(`${JSON.stringify({ segments: streamedSegments })}\n`);
      close();
    });

    await waitFor(() => {
      expect(updates.at(-1)).toEqual({
        segments: streamedSegments,
        hasStreamedPartial: true,
        isStreaming: false,
        error: null,
      });
    });
  });

  it("clears previous segments when a new navigation begins", async () => {
    const first = createStream();
    const second = createStream();

    const fetchMock = vi
      .fn(() =>
        Promise.resolve(
          new Response(new ReadableStream<Uint8Array>(), {
            status: 200,
            headers: { "Content-Type": "text/x-ndjson" },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(first.stream, {
          status: 200,
          headers: { "Content-Type": "text/x-ndjson" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(second.stream, {
          status: 200,
          headers: { "Content-Type": "text/x-ndjson" },
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    const updates: StreamResult[] = [];

    const { rerender } = render(
      <TestComponent
        navigation={createIdleNavigation()}
        search="?s=40&l=40"
        onUpdate={(value) => {
          updates.push(value);
        }}
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const initialSegments: HueSegment[] = [
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
      first.enqueue(`${JSON.stringify({ segments: initialSegments })}\n`);
      first.close();
    });

    await waitFor(() => {
      expect(updates.at(-1)).toEqual({
        segments: initialSegments,
        hasStreamedPartial: true,
        isStreaming: false,
        error: null,
      });
    });

    const loadingNavigation = createLoadingNavigation("?s=70&l=20");

    rerender(
      <TestComponent
        navigation={loadingNavigation}
        search="?s=40&l=40"
        onUpdate={(value) => {
          updates.push(value);
        }}
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(updates.at(-1)).toMatchObject({
        segments: [],
        hasStreamedPartial: false,
        isStreaming: true,
        error: null,
      });
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

    await act(async () => {
      second.enqueue(`${JSON.stringify({ segments: nextSegments })}\n`);
      second.close();
    });

    await waitFor(() => {
      expect(updates.at(-1)).toEqual({
        segments: nextSegments,
        hasStreamedPartial: true,
        isStreaming: false,
        error: null,
      });
    });

    rerender(
      <TestComponent
        navigation={createIdleNavigation()}
        search="?s=70&l=20"
        onUpdate={(value) => {
          updates.push(value);
        }}
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        "http://localhost:3000/swatches.stream?s=70&l=20",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });
});
