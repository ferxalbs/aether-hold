import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";
import { validateProviderConfiguration } from "./lib/provider-config";

export default function nextConfig(phase: string): NextConfig {
  // A local production build may intentionally omit deployment-only services;
  // a Vercel production build must fail before it can publish an unprotected app.
  if (phase !== PHASE_PRODUCTION_BUILD || process.env.VERCEL_ENV === "production") {
    validateProviderConfiguration();
  }
  const scriptSources =
    phase === PHASE_DEVELOPMENT_SERVER ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'";

  return {
    reactCompiler: true,
    devIndicators: false,
    async headers() {
      return [
        {
          source: "/(.*)",
          headers: [
            { key: "X-Content-Type-Options", value: "nosniff" },
            { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
            { key: "X-Frame-Options", value: "DENY" },
            { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
            {
              key: "Content-Security-Policy",
              value: `default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; script-src ${scriptSources}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'`,
            },
            { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
            { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          ],
        },
      ];
    },
  };
}
