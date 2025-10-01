import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("api/segments", "routes/api.segments.ts"),
] satisfies RouteConfig;
