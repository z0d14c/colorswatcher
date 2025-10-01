import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("swatches.stream", "routes/swatches.stream.ts"),
] satisfies RouteConfig;
