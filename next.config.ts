import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin Turbopack's project root to this folder. Without this, Turbopack's
  // root auto-detection can walk up to the wrong directory (the path here is
  // nested and contains spaces), fail to resolve node_modules/next, and panic
  // with "Next.js package not found" on every HMR update — which shows up in
  // the browser as the page reloading every split second.
  turbopack: {
    root: __dirname,
  },
  // Analytics' Overview now lives on the home page (Markets). Query strings
  // such as ?w=7D carry over.
  async redirects() {
    return [{ source: "/analytics", destination: "/", permanent: false }];
  },
};

export default nextConfig;
