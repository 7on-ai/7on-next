"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@repo/design-system/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/design-system/components/ui/card";
import { Github, Linkedin as LinkedinIcon, Sparkles, Loader2, Check } from "lucide-react";
import { useSubscription } from "@repo/auth/hooks/use-subscription";
import type { SubscriptionTier } from "@repo/auth/client";
import Link from "next/link";

// Icons
const GoogleIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92..." />
  </svg>
);

const DiscordIcon = () => (
  <svg className="h-5 w-5" fill="#5865F2" viewBox="0 0 24 24">
    <path d="M20.317 4.37a19.791..." />
  </svg>
);

const SpotifyIcon = () => (
  <svg className="h-5 w-5" fill="#1DB954" viewBox="0 0 24 24">
    <path d="M12 0C5.4 0..." />
  </svg>
);

const LinkedInCustomIcon = () => (
  <svg className="h-5 w-5" fill="#0A66C2" viewBox="0 0 24 24">
    <path d="M20.447 20.452h-3.554v-5.569..." />
  </svg>
);

// Constants
const CLIENT_IDS = {
  google: process.env.NEXT_PUBLIC_AUTH0_GOOGLE_CLIENT_ID ?? "",
  spotify: process.env.NEXT_PUBLIC_AUTH0_SPOTIFY_CLIENT_ID ?? "",
  discord: process.env.NEXT_PUBLIC_AUTH0_DISCORD_CLIENT_ID ?? "",
  github: process.env.NEXT_PUBLIC_AUTH0_GITHUB_CLIENT_ID ?? "",
  linkedin: process.env.NEXT_PUBLIC_AUTH0_LINKEDIN_CLIENT_ID ?? "",
};

const BASE_SCOPES = {
  google:
    "openid profile email offline_access https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/spreadsheets",
  spotify:
    "openid user-read-email user-read-private user-read-playback-state user-library-read offline_access",
  discord: "openid identify email guilds offline_access",
  github: "openid user:email repo read:user offline_access",
  linkedin: "openid r_liteprofile r_emailaddress w_member_social offline_access",
};

const TIER_FEATURES = {
  FREE: ["google", "github"],
  PRO: ["google", "github", "spotify", "discord"],
  BUSINESS: ["google", "github", "spotify", "discord", "linkedin"],
};

// Utility functions
const createOAuthState = (userId: string, service: string): string =>
  btoa(
    JSON.stringify({
      user_id: userId,
      service,
      timestamp: Date.now(),
    })
  );

const buildAuthorizationUrl = (service: keyof typeof CLIENT_IDS, state: string): string => {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_IDS[service]!,
    redirect_uri:
      process.env.NEXT_PUBLIC_AUTH0_CALLBACK_URL ??
      process.env.NEXT_PUBLIC_APP_URL + "/api/oauth-callback",
    scope: BASE_SCOPES[service],
    state,
    audience: `https://${process.env.NEXT_PUBLIC_AUTH0_DOMAIN}/api/v2/`,
    connection: service === "google" ? "google-oauth2" : service,
  });

  if (service === "google") {
    params.append("access_type", "offline");
    params.append("prompt", "consent");
  }

  if (service === "spotify") params.append("show_dialog", "true");

  return `https://${process.env.NEXT_PUBLIC_AUTH0_DOMAIN}/authorize?${params.toString()}`;
};

const clearUrlParams = (paramsToRemove: string[]) => {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  paramsToRemove.forEach((param) => url.searchParams.delete(param));
  window.history.replaceState({}, "", url.toString());
};

const isFeatureAvailable = (service: string, tier: SubscriptionTier): boolean =>
  TIER_FEATURES[tier]?.includes(service) || false;

interface Toast {
  id: number;
  message: string;
  visible: boolean;
  showIcon: boolean;
}

interface DashboardClientProps {
  userId: string | null;
  userEmail: string | null;
  initialTier: SubscriptionTier;
}

export function DashboardClientWrapper({
  userId,
  userEmail,
  initialTier,
}: DashboardClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [toast, setToast] = useState<Toast | null>(null);
  const { tier, isFree } = useSubscription() ?? {
    tier: initialTier,
    isFree: initialTier === "FREE",
  };
  const [stats, setStats] = useState({ activeConnections: 0 });
  const currentTier = tier || initialTier;

  const services = [
    { service: "google" as const, label: "Google", icon: <GoogleIcon /> },
    { service: "github" as const, label: "GitHub", icon: <Github className="h-5 w-5" /> },
    { service: "spotify" as const, label: "Spotify", icon: <SpotifyIcon /> },
    { service: "discord" as const, label: "Discord", icon: <DiscordIcon /> },
    { service: "linkedin" as const, label: "LinkedIn", icon: <LinkedInCustomIcon /> },
  ];

  const availableServices = services.filter((s) =>
    isFeatureAvailable(s.service, currentTier)
  );
  const lockedServices = services.filter(
    (s) => !isFeatureAvailable(s.service, currentTier)
  );

  const showToast = (message: string) => {
    const newToast = { id: Date.now(), message, visible: true, showIcon: false };
    setToast(newToast);
    setTimeout(() => {
      setToast((prev) => (prev ? { ...prev, showIcon: true } : null));
    }, 200);
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast((prev) =>
        prev ? { ...prev, visible: false, showIcon: false } : null
      );
      setTimeout(() => setToast(null), 500);
    }, 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const connected = searchParams.get("connected");
    const status = searchParams.get("status");
    const error = searchParams.get("error");
    if (connected && status === "success") {
      showToast(`✅ Successfully connected ${connected}!`);
      clearUrlParams(["connected", "status", "timestamp"]);
    } else if (error) {
      showToast(`❌ Connection failed: ${decodeURIComponent(error)}`);
      clearUrlParams(["error", "timestamp"]);
    }
  }, [searchParams]);

  useEffect(() => {
    const fetchStats = async () => {
      if (!userId) return;
      try {
        const res = await fetch(`/api/user/n8n-status?userId=${userId}`);
        if (res.ok) {
          const data = await res.json();
          setStats({ activeConnections: data.injected_providers_count || 0 });
        }
      } catch (err) {
        console.error("Error fetching stats:", err);
      }
    };
    fetchStats();
  }, [userId]);

  const handleConnect = (service: keyof typeof CLIENT_IDS, isLocked: boolean) => {
    if (!userId || (isLocked && isFree)) return;
    const state = createOAuthState(userId, service);
    const url = buildAuthorizationUrl(service, state);
    window.location.href = url;
  };

  return (
    <div className="w-full min-h-screen relative overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url(/background.jpeg)" }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/40" />

      {/* Main Content */}
      <div className="relative z-10 flex items-center justify-center min-h-screen p-6">
        <div className="w-full max-w-xl space-y-6">
          {/* Active Connections */}
          <div className="w-80 p-6 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white text-lg font-semibold">
                Active Connections
              </h3>
              <Github className="h-5 w-5 text-white/70" />
            </div>
            <div className="text-5xl font-bold text-white">
              {stats.activeConnections}
            </div>
          </div>

          {/* Current Plan */}
          <div className="w-80 p-6 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white text-lg font-semibold">Current Plan</h3>
              <Sparkles className="h-5 w-5 text-white/70" />
            </div>
            <div className="flex items-baseline justify-between">
              <div className="text-5xl font-bold text-white">{currentTier}</div>
              {isFree && (
                <Button
                  asChild
                  size="sm"
                  className="bg-white/20 hover:bg-white/30 text-white border border-white/30 rounded-xl"
                >
                  <Link href="/pricing" className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-white" />
                    Upgrade
                  </Link>
                </Button>
              )}
            </div>
          </div>

          {/* Available Integrations */}
          <div className="w-80 p-6 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 shadow-xl">
            <h3 className="text-white text-xl font-bold mb-6">
              Available Integrations
            </h3>
            <div className="space-y-2">
              {availableServices.map(({ service, label, icon }) => (
                <div
                  key={service}
                  onClick={() => {
                    handleConnect(service, false);
                    showToast(`Connecting to ${label}...`);
                  }}
                  className="flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer transition hover:bg-white/15 hover:scale-[1.02] border border-white/20"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg">
                    {icon}
                  </div>
                  <span className="text-white font-medium text-sm flex-1">
                    Connect {label}
                  </span>
                  <svg
                    className="h-4 w-4 text-white/70"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              ))}
            </div>
          </div>

          {/* Locked Integrations */}
          {lockedServices.length > 0 && (
            <div className="w-80 p-6 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 shadow-xl opacity-80">
              <h3 className="text-white text-xl font-bold mb-6">
                Upgrade to Unlock
              </h3>
              <div className="space-y-2">
                {lockedServices.map(({ service, label, icon }) => (
                  <div
                    key={service}
                    className="flex items-center gap-4 px-4 py-3 rounded-xl border border-white/20 bg-white/5 cursor-not-allowed"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg opacity-70">
                      {icon}
                    </div>
                    <span className="text-white/70 font-medium text-sm flex-1">
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-8 left-1/2 -translate-x-1/2 p-4 rounded-2xl bg-white/95 backdrop-blur-xl border border-gray-200 shadow-2xl z-50 transition-all ${
            toast.visible
              ? "opacity-100 translate-y-0"
              : "opacity-0 -translate-y-8"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-full bg-green-100 flex items-center justify-center transition ${
                toast.showIcon ? "scale-100" : "scale-0"
              }`}
            >
              <Check className="w-4 h-4 text-green-600" />
            </div>
            <span className="text-gray-900 font-medium text-sm">
              {toast.message}
            </span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-200">
            <div
              className="h-full bg-green-500 animate-[progressBar_2.5s_linear]"
            />
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes progressBar {
          0% {
            width: 100%;
          }
          100% {
            width: 0%;
          }
        }
      `}</style>
    </div>
  );
}
