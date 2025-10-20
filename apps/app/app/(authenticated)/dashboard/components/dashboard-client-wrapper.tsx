"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@repo/design-system/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/design-system/components/ui/card";
import { GithubIcon, Linkedin, SparklesIcon, Loader2, Check } from "lucide-react";
import { useSubscription } from '@repo/auth/hooks/use-subscription';
import type { SubscriptionTier } from '@repo/auth/client';
import Link from 'next/link';

// Icons
const GoogleIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

const DiscordIcon = () => (
  <svg className="h-5 w-5" fill="#5865F2" viewBox="0 0 24 24">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
  </svg>
);

const SpotifyIcon = () => (
  <svg className="h-5 w-5" fill="#1DB954" viewBox="0 0 24 24">
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z"/>
  </svg>
);

const LinkedInIcon = () => (
  <svg className="h-5 w-5" fill="#0A66C2" viewBox="0 0 24 24">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
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
  google: "openid profile email offline_access https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/spreadsheets",
  spotify: "openid user-read-email user-read-private user-read-playback-state user-library-read offline_access",
  discord: "openid identify email guilds offline_access",
  github: "openid user:email repo read:user offline_access",
  linkedin: "openid r_liteprofile r_emailaddress w_member_social offline_access",
};

const TIER_FEATURES = {
  FREE: ['google', 'github'],
  PRO: ['google', 'github', 'spotify', 'discord'],
  BUSINESS: ['google', 'github', 'spotify', 'discord', 'linkedin'],
};

// Utility functions
const createOAuthState = (userId: string, service: string): string => {
  return btoa(JSON.stringify({
    user_id: userId,
    service: service,
    timestamp: Date.now(),
  }));
};

const buildAuthorizationUrl = (service: keyof typeof CLIENT_IDS, state: string): string => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_IDS[service]!,
    redirect_uri: `${process.env.NEXT_PUBLIC_AUTH0_CALLBACK_URL ?? process.env.NEXT_PUBLIC_APP_URL + '/api/oauth-callback'}`,
    scope: BASE_SCOPES[service],
    state,
    audience: `https://${process.env.NEXT_PUBLIC_AUTH0_DOMAIN}/api/v2/`,
    connection: service === 'google' ? 'google-oauth2' : service,
  });

  if (service === 'google') {
    params.append('access_type', 'offline');
    params.append('prompt', 'consent');
  }

  if (service === 'spotify') {
    params.append('show_dialog', 'true');
  }

  return `https://${process.env.NEXT_PUBLIC_AUTH0_DOMAIN}/authorize?${params.toString()}`;
};

const clearUrlParams = (paramsToRemove: string[]): void => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  paramsToRemove.forEach(param => url.searchParams.delete(param));
  window.history.replaceState({}, '', url.toString());
};

const isFeatureAvailable = (service: string, tier: SubscriptionTier): boolean => {
  return TIER_FEATURES[tier]?.includes(service) || false;
};

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

export function DashboardClientWrapper({ userId, userEmail, initialTier }: DashboardClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [toast, setToast] = useState<Toast | null>(null);
  const { tier, isFree } = useSubscription() ?? { tier: initialTier, isFree: initialTier === 'FREE' };
  const [stats, setStats] = useState({ activeConnections: 0 });
  const currentTier = tier || initialTier;

  const services = [
    { service: "google" as const, label: "Google", icon: <GoogleIcon /> },
    { service: "github" as const, label: "GitHub", icon: <GithubIcon className="h-5 w-5" /> },
    { service: "spotify" as const, label: "Spotify", icon: <SpotifyIcon /> },
    { service: "discord" as const, label: "Discord", icon: <DiscordIcon /> },
    { service: "linkedin" as const, label: "LinkedIn", icon: <LinkedInIcon /> },
  ];

  const availableServices = services.filter(s => isFeatureAvailable(s.service, currentTier));
  const lockedServices = services.filter(s => !isFeatureAvailable(s.service, currentTier));

  const showToast = (message: string) => {
    const newToast = {
      id: Date.now(),
      message,
      visible: true,
      showIcon: false,
    };
    setToast(newToast);

    setTimeout(() => {
      setToast((prev) => (prev ? { ...prev, showIcon: true } : null));
    }, 200);
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast((prev) => (prev ? { ...prev, visible: false, showIcon: false } : null));
        setTimeout(() => setToast(null), 500);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    const connected = searchParams.get("connected");
    const status = searchParams.get("status");
    const error = searchParams.get("error");

    if (connected && status === "success") {
      showToast(`✅ Successfully connected ${connected}!`);
      clearUrlParams(['connected', 'status', 'timestamp']);
    } else if (error) {
      showToast(`❌ Connection failed: ${decodeURIComponent(error)}`);
      clearUrlParams(['error', 'timestamp']);
    }
  }, [searchParams]);

  useEffect(() => {
    const fetchStats = async () => {
      if (!userId) return;

      try {
        const response = await fetch(`/api/user/n8n-status?userId=${userId}`);
        if (response.ok) {
          const data = await response.json();
          setStats({
            activeConnections: data.injected_providers_count || 0,
          });
        }
      } catch (error) {
        console.error('Error fetching stats:', error);
      }
    };

    fetchStats();
  }, [userId]);

  const handleConnect = (service: keyof typeof CLIENT_IDS, isLocked: boolean) => {
    if (!userId || (isLocked && isFree)) return;

    const state = createOAuthState(userId, service);
    const authUrl = buildAuthorizationUrl(service, state);
    window.location.href = authUrl;
  };

  return (
    <div className="w-full min-h-screen relative overflow-hidden">
      {/* Background Image */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: 'url(/background.jpeg)',
          filter: 'blur(0px)',
        }}
      />
      
      {/* Overlay for better readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/40" />

      {/* Main Content Container - Centered */}
      <div className="relative z-10 flex items-center justify-center min-h-screen p-6">
        <div className="w-full max-w-xl space-y-6">
          
          {/* Active Connections Card */}
          <div className="w-full p-8 rounded-3xl bg-white/95 backdrop-blur-xl border border-white/40 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-800">Active Connections</h3>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" className="h-5 w-5 text-gray-500">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div className="text-5xl font-bold text-gray-900">{stats.activeConnections}</div>
          </div>

          {/* Current Plan Card */}
          <div className="w-full p-8 rounded-3xl bg-white/95 backdrop-blur-xl border border-white/40 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-800">Current Plan</h3>
              <SparklesIcon className="h-5 w-5 text-gray-500" />
            </div>
            <div className="flex items-baseline justify-between">
              <div className="text-5xl font-bold text-gray-900">{currentTier}</div>
              {isFree && (
                <Button asChild size="sm" className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white">
                  <Link href="/pricing" className="flex items-center gap-2">
                    <SparklesIcon className="h-4 w-4" />
                    Upgrade
                  </Link>
                </Button>
              )}
            </div>
          </div>

          {/* Available Integrations Section */}
          <div className="w-full p-8 rounded-3xl bg-white/95 backdrop-blur-xl border border-white/40 shadow-2xl">
            <h3 className="text-xl font-bold text-gray-900 mb-6">Available Integrations</h3>
            <div className="space-y-3">
              {availableServices.map(({ service, label, icon }) => (
                <div
                  key={service}
                  onClick={() => {
                    handleConnect(service, false);
                    showToast(`Connecting to ${label}...`);
                  }}
                  className="flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-300 ease-out cursor-pointer bg-gradient-to-r from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-200 border border-gray-200 hover:border-gray-300 hover:shadow-lg active:scale-[0.98]"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm">
                    {icon}
                  </div>
                  <span className="text-gray-900 font-semibold text-base flex-1">Connect {label}</span>
                  <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              ))}
            </div>
          </div>

          {/* Locked Integrations Section */}
          {lockedServices.length > 0 && (
            <div className="w-full p-8 rounded-3xl bg-white/90 backdrop-blur-xl border border-white/30 shadow-2xl opacity-75">
              <h3 className="text-xl font-bold text-gray-700 mb-6">Upgrade to Unlock</h3>
              <div className="space-y-3">
                {lockedServices.map(({ service, label, icon }) => (
                  <div
                    key={service}
                    className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-gray-100/50 border border-gray-200 cursor-not-allowed"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/50">
                      {icon}
                    </div>
                    <span className="text-gray-500 font-semibold text-base flex-1">{label}</span>
                    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-8 left-1/2 -translate-x-1/2 p-4 rounded-2xl bg-white/95 backdrop-blur-xl border border-gray-200 shadow-2xl transition-all duration-500 ease-out transform-gpu z-50 ${
            toast.visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 -translate-y-8 scale-95"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-full bg-green-100 flex items-center justify-center transition-all duration-300 ease-out ${
                toast.showIcon ? "scale-100 rotate-0" : "scale-0 rotate-180"
              }`}
            >
              <Check
                className={`w-4 h-4 text-green-600 transition-all duration-200 delay-100 ${
                  toast.showIcon ? "opacity-100 scale-100" : "opacity-0 scale-50"
                }`}
              />
            </div>
            <span className="text-gray-900 font-medium text-sm">{toast.message}</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-200 rounded-b-2xl overflow-hidden">
            <div
              className="h-full bg-green-500"
              style={{
                animation: toast.visible ? "progressBar 2.5s linear" : "none",
              }}
            />
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes progressBar {
          0% { width: 100%; }
          100% { width: 0%; }
        }
      `}</style>
    </div>
  );
}